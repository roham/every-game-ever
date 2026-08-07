#!/usr/bin/env python3
"""ege — Every Game Ever dataset pipeline.

Facts-only public dataset derived from the internal `nba_reference`
Supabase project. Legal boundary: scores, schedules, flows, empirical
aggregates. NEVER ship descriptions, qids, internal ids, or narratives.

Subcommands:
  build   --seasons 1980-81,2025-26 | --all   derive games/flow/teams/era/wpin
  check   --license                          acceptance checks (final-score match,
                                             banned-content scan)
  stats                                     totals from data/current
  wp      --rebuild                         empirical win-probability table
  precedents                                named precedent leaderboards
  players                                   public players + players map
  release --version X                       license-safe bundle (P4)
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "current"
FLOW_DIR = DATA / "flow"
WPIN_DIR = DATA / "wpin"
GSM_PROJECT = "dl-ai-pantheon"

BANNED = ["description", "narrative", "qid", "top_shot", "topshot", "slack",
          "email", "service_key", "secret", "apikey", "password", "token"]
PAGE = 1000
URL_CHUNK = 150           # game ids per in.() chunk (Kong URL size guard)
WORKERS = 6
RETRIES = 6

GAMES_SELECT = ",".join([
    "game_id", "game_date", "season_id", "game_type", "home_team_id",
    "away_team_id", "home_score", "away_score", "playoff_round",
    "overtime_periods", "attendance", "venue_name", "bbref_game_id",
])
PLAYS_SELECT = ",".join([
    "game_id", "period", "clock_seconds_remaining", "home_score_after",
    "away_score_after", "primary_player_qid",
])
PLAYERS_SELECT = ",".join([
    "player_id", "qid", "bbref_slug", "full_name", "common_name",
    "debut_date", "final_game_date", "positions", "primary_position",
    "is_hall_of_fame", "hof_class_year",
])


# ── credentials / net ─────────────────────────────────────────────────────

def _gsm(name: str) -> str:
    env_map = {
        "magic-supabase-nba-reference-url": "SUPABASE_NBA_REFERENCE_URL",
        "magic-supabase-nba-reference-key": "SUPABASE_NBA_REFERENCE_KEY",
    }
    env_key = env_map.get(name)
    if env_key and os.environ.get(env_key):
        return os.environ[env_key]
    return subprocess.check_output(
        ["gcloud", "secrets", "versions", "access", "latest",
         f"--secret={name}", f"--project={GSM_PROJECT}"],
        text=True).strip()


def _creds() -> tuple[str, str]:
    return _gsm("magic-supabase-nba-reference-url").rstrip("/"), \
        _gsm("magic-supabase-nba-reference-key")


def rest(url: str, key: str, profile: str, tail: str, timeout: int = 45):
    req = urllib.request.Request(
        url + tail,
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Accept-Profile": profile},
    )
    last = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.5 * (2 ** attempt) + random.random() * 0.3)
    raise RuntimeError(f"REST failed: {last}")


def fetch_all(url, key, profile, table, select, filters=None,
              page_size=PAGE, log=None) -> list[dict]:
    """Paginated fetch with Range headers."""
    out = []
    params = {"select": select}
    params.update(filters or {})
    qs = urllib.parse.urlencode(params)
    off = 0
    while True:
        hdr = f"Range={off}-{off + page_size - 1}"
        req = urllib.request.Request(
            url + f"/rest/v1/{table}?{qs}",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Accept-Profile": profile, "Range": hdr},
        )
        rows = None
        for attempt in range(RETRIES):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    rows = json.loads(r.read().decode())
                break
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(0.5 * (2 ** attempt) + random.random() * 0.3)
        if rows is None:
            raise RuntimeError(f"fetch_all {table} @{off}: {last}")
        if not rows:
            break
        out.extend(rows)
        if log:
            log(f"  {table}: {len(out)} rows")
        if len(rows) < page_size:
            break
        off += page_size
    return out


# ── small helpers ─────────────────────────────────────────────────────────

def season_year(season_id: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", season_id or "")
    return int(m.group(0)) if m else None


def era_for(season_id: str) -> str:
    y = season_year(season_id)
    if y is None:
        return "unknown"
    if y < 1980:
        return "pre80"
    if y <= 1995:
        return "80-95"
    if y <= 2013:
        return "96-13"
    return "14-now"


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sec_from_start(period: int, clock: float | None) -> int:
    """Game seconds elapsed at this play. Regulation periods 720s, OT 300s."""
    if clock is None:
        return 999_999_999
    c = int(round(clock))
    if period <= 4:
        return (period - 1) * 720 + (720 - c)
    return 2880 + (period - 5) * 300 + (300 - c)


# ── build ─────────────────────────────────────────────────────────────────

def fetch_games(url, key) -> list[dict]:
    rows = fetch_all(url, key, "nba_reference", "nba_games", GAMES_SELECT)
    played = [g for g in rows if g.get("home_score") is not None
              and g.get("away_score") is not None]
    return played


def fetch_plays_for_games(url, key, game_ids: list[str], log):
    """Chunked in.() pulls, parallel workers. Returns flat row list."""
    chunks = [game_ids[i:i + URL_CHUNK] for i in range(0, len(game_ids), URL_CHUNK)]
    results: list[list[dict]] = []
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {}
        for c in chunks:
            ids = ",".join(c)
            futs[ex.submit(rest, url, key, "nba_reference",
                           f"/rest/v1/nba_plays?select={PLAYS_SELECT}"
                           f"&game_id=in.({ids})")] = len(c)
        for fut in cf.as_completed(futs):
            try:
                results.append(fut.result())
            except Exception as e:  # noqa: BLE001
                log(f"chunk FAILED ({futs[fut]} ids): {e}")
                raise
    return [r for chunk in results for r in chunk]


def derive_flow(game_id: str, rows: list[dict]) -> list[dict]:
    """Rows -> sorted scoring events (score_after deltas).

    Sort: period asc, clock desc (chronological within period), stable on
    insertion order. Emit one event per score_after change.
    """
    keyed = []
    for i, r in enumerate(rows):
        keyed.append((r.get("period") or 1,
                      -(r.get("clock_seconds_remaining")
                        if r.get("clock_seconds_remaining") is not None else -1),
                      i, r))
    keyed.sort(key=lambda t: (t[0], t[1], t[2]))
    events = []
    prev = None
    for period, neg_clock, idx, r in keyed:
        h, a = r.get("home_score_after"), r.get("away_score_after")
        if h is None or a is None:
            continue
        if prev is None:
            prev = (h, a)
            events.append({
                "game_id": game_id, "period": period,
                "clock_remaining_s": r.get("clock_seconds_remaining"),
                "home_score": h, "away_score": a, "margin": h - a,
                "event": "first", "seq": len(events),
            })
            continue
        if (h, a) != prev:
            ev = "score_home" if h > prev[0] else ("score_away" if a > prev[1] else "score")
            events.append({
                "game_id": game_id, "period": period,
                "clock_remaining_s": r.get("clock_seconds_remaining"),
                "home_score": h, "away_score": a, "margin": h - a,
                "event": ev, "seq": len(events),
            })
            prev = (h, a)
    return events


def build_season(seas: str, games: dict[str, dict], slug_of_qid: dict,
                 url, key, log) -> dict:
    gids = [g for g in games if games[g]["season_id"] == seas]
    rows = fetch_plays_for_games(url, key, gids, log)
    log(f"{seas}: {len(gids)} games, {len(rows)} play rows")

    by_game: dict[str, list[dict]] = {}
    for r in rows:
        by_game.setdefault(r["game_id"], []).append(r)

    events, player_games, wpin = [], [], []
    for gid, rs in by_game.items():
        evs = derive_flow(gid, rs)
        events.extend(evs)
        if evs:
            last = evs[-1]
            for e in evs:
                e["season_id"] = seas
            # wp input: margin at every 24s boundary walk
            max_sec = sec_from_start(last["period"], last["clock_remaining_s"])
            if max_sec < 999_999_999:
                buckets = []
                cur = None
                ei = 0
                for b in range(0, max_sec + 24, 24):
                    while ei < len(evs) and \
                            sec_from_start(evs[ei]["period"],
                                           evs[ei]["clock_remaining_s"]) <= b:
                        cur = evs[ei]
                        ei += 1
                    if cur is not None:
                        buckets.append((b, cur["margin"]))
                for b, m in buckets:
                    wpin.append({"game_id": gid, "season_id": seas,
                                 "era": era_for(seas), "sec_bucket": b,
                                 "margin": max(-30, min(30, m))})
        for r in rs:
            q = r.get("primary_player_qid")
            if q and q in slug_of_qid:
                player_games.append({"bbref_slug": slug_of_qid[q], "game_id": gid})

    out = {}
    if events:
        t = pa.table({
            "game_id": [e["game_id"] for e in events],
            "season_id": [e["season_id"] for e in events],
            "period": [e["period"] for e in events],
            "clock_remaining_s": [e["clock_remaining_s"] for e in events],
            "home_score": [e["home_score"] for e in events],
            "away_score": [e["away_score"] for e in events],
            "margin": [e["margin"] for e in events],
            "event": [e["event"] for e in events],
            "seq": [e["seq"] for e in events],
        })
        pq.write_table(t, FLOW_DIR / f"{seas}.parquet")
        out["flow_rows"] = len(events)
    if player_games:
        uniq = {(p["bbref_slug"], p["game_id"]) for p in player_games}
        t = pa.table({
            "bbref_slug": [u[0] for u in sorted(uniq)],
            "game_id": [u[1] for u in sorted(uniq)],
            "season_id": [seas] * len(uniq),
        })
        pq.write_table(t, DATA / "player_games" / f"{seas}.parquet")
        out["player_games_rows"] = len(uniq)
    if wpin:
        t = pa.table({
            "game_id": [w["game_id"] for w in wpin],
            "sec_bucket": [w["sec_bucket"] for w in wpin],
            "margin": [w["margin"] for w in wpin],
        })
        pq.write_table(t, WPIN_DIR / f"{seas}.parquet")
        out["wpin_rows"] = len(wpin)
    return out


def cmd_build(args, log=print):
    url, key = _creds()
    (FLOW_DIR / "..").mkdir(parents=True, exist_ok=True)
    FLOW_DIR.mkdir(exist_ok=True)
    WPIN_DIR.mkdir(exist_ok=True)
    (DATA / "player_games").mkdir(exist_ok=True)

    log("fetching games…")
    games_rows = fetch_all(url, key, "nba_reference", "nba_games", GAMES_SELECT, log=log)
    games = {g["game_id"]: g for g in games_rows
             if g.get("home_score") is not None and g.get("away_score") is not None}
    log(f"games played: {len(games)}")

    log("fetching players…")
    players = fetch_all(url, key, "nba_reference", "nba_players", PLAYERS_SELECT, log=log)
    slug_of_qid = {p["qid"]: p["bbref_slug"] for p in players if p.get("qid")}
    qid_of_slug = {p["bbref_slug"]: p for p in players if p.get("bbref_slug")}
    log(f"players: {len(players)} (qid-resolved {len(slug_of_qid)})")

    seas_all = sorted({g["season_id"] for g in games.values()})
    seas = list(args.seasons) if args.seasons else seas_all
    log(f"seasons to build: {len(seas)}")

    manifest = {"version": "0.1.0", "built_at": time.strftime(
        "%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seasons": {}}
    mpath = DATA / "manifest.json"
    if mpath.exists() and args.resume:
        manifest = json.loads(mpath.read_text())

    for i, seas in enumerate(seas, 1):
        if (FLOW_DIR / f"{seas}.parquet").exists() and not args.force:
            log(f"[{i}/{len(seas)}] {seas}: done (skip)")
            continue
        t0 = time.time()
        try:
            out = build_season(seas, games, slug_of_qid, url, key, log)
        except Exception as e:  # noqa: BLE001
            log(f"[{i}/{len(seas)}] {seas}: FAILED {e}")
            manifest["seasons"].setdefault(seas, {})["error"] = str(e)
            mpath.write_text(json.dumps(manifest, indent=2))
            if args.fail_fast:
                raise
            continue
        manifest["seasons"][seas] = {
            "games": sum(1 for g in games.values() if g["season_id"] == seas),
            **out, "seconds": round(time.time() - t0, 1),
        }
        mpath.write_text(json.dumps(manifest, indent=2))
        log(f"[{i}/{len(seas)}] {seas}: done in {time.time() - t0:.0f}s {out}")

    log("deriving games/teams/era…")
    rows = []
    for g in games.values():
        rows.append({
            "game_id": g["game_id"], "game_date": g["game_date"],
            "season_id": g["season_id"], "game_type": g["game_type"],
            "home_team_id": g["home_team_id"], "away_team_id": g["away_team_id"],
            "home_score": g["home_score"], "away_score": g["away_score"],
            "playoff_round": g.get("playoff_round"),
            "overtime_periods": g.get("overtime_periods"),
            "attendance": g.get("attendance"), "venue_name": g.get("venue_name"),
        })
    t = pa.table({k: [r[k] for r in rows] for k in rows[0]})
    pq.write_table(t, DATA / "games.parquet")

    team_rows = {}
    for g in games.values():
        for side in ("home", "away"):
            tid, name = g[f"{side}_team_id"], None
            team_rows.setdefault(tid, {"team_id": tid, "name": name,
                                       "first_season": g["season_id"],
                                       "last_season": g["season_id"]})
            tr = team_rows[tid]
            tr["first_season"] = min(tr["first_season"], g["season_id"])
            tr["last_season"] = max(tr["last_season"], g["season_id"])
    t = pa.table({k: [r[k] for r in team_rows.values()] for k in
                  ("team_id", "name", "first_season", "last_season")})
    pq.write_table(t, DATA / "teams.parquet")

    if qid_of_slug:
        pub = []
        for slug, p in qid_of_slug.items():
            pub.append({
                "bbref_slug": slug, "full_name": p.get("full_name"),
                "common_name": p.get("common_name"), "positions": p.get("positions"),
                "primary_position": p.get("primary_position"),
                "debut_date": p.get("debut_date"),
                "final_game_date": p.get("final_game_date"),
                "is_hall_of_fame": p.get("is_hall_of_fame"),
            })
        t = pa.table({k: [r[k] for r in pub] for k in pub[0]})
        pq.write_table(t, DATA / "players-public.parquet")

    log("deriving era.parquet…")
    import duckdb
    con = duckdb.connect()
    con.execute(
        f"CREATE VIEW flow AS SELECT * FROM read_parquet('{FLOW_DIR}/*.parquet')")
    era = con.execute("""
        SELECT season_id, count(*) AS ev,
               count(DISTINCT game_id) AS games_with_pbp,
               sum(CASE WHEN margin != 0 THEN 1 ELSE 0 END) AS nonzero_ev,
               avg(abs(margin)) AS avg_margin_abs
        FROM flow GROUP BY season_id
    """).fetchdf()
    era.to_parquet(DATA / "era.parquet")
    log("build complete")
    return games, players


def cmd_check(args, log=print):
    import duckdb
    con = duckdb.connect()
    con.execute(f"CREATE VIEW flow AS SELECT * FROM read_parquet('{FLOW_DIR}/*.parquet')")
    games_t = con.execute("SELECT * FROM read_parquet('" + str(DATA / "games.parquet") + "')").fetchdf()
    n = len(games_t)
    # final-score match on sample
    sample = games_t.sample(min(500, n), random_state=42)
    mism = 0
    checked = 0
    for _, g in sample.iterrows():
        last = con.execute("SELECT home_score, away_score FROM flow WHERE game_id = ? "
                           "ORDER BY seq DESC LIMIT 1", [g["game_id"]]).fetchone()
        checked += 1
        if last is None:
            continue
        if last[0] != g["home_score"] or last[1] != g["away_score"]:
            mism += 1
            if mism <= 5:
                log(f"  MISMATCH {g['game_id']}: flow={last} games={g['home_score']}-{g['away_score']}")
    pbp_games = con.execute("SELECT count(DISTINCT game_id) FROM flow").fetchone()[0]
    log(f"check: {checked} sampled, {mism} mismatches (must be 0), "
        f"games with pbp {pbp_games}/{n}")
    if mism:
        raise SystemExit(f"FAIL: {mism} mismatches")

    if args.license:
        banned_hits = []
        for f in sorted(DATA.rglob("*.parquet")):
            try:
                t = pq.read_table(f)
            except Exception:  # noqa: BLE001
                continue
            for col in t.column_names:
                low = col.lower()
                if any(b in low for b in BANNED):
                    banned_hits.append(f"{f.name}:{col}")
            for col in t.column_names:
                for v in t.column(col).to_pylist()[:200]:
                    if isinstance(v, str) and any(b in v.lower() for b in BANNED):
                        banned_hits.append(f"{f.name}:{col}=…{v[:40]}")
                        break
        uniq = sorted(set(banned_hits))
        if uniq:
            log("\n".join(uniq))
            raise SystemExit(f"LICENSE FAIL: {len(uniq)} banned hits")
        log("license check: clean")
    log("check OK")


def cmd_stats(args, log=print):
    import duckdb
    con = duckdb.connect()
    con.execute(f"CREATE VIEW flow AS SELECT * FROM read_parquet('{FLOW_DIR}/*.parquet')")
    log("games:", con.execute("SELECT count(*) FROM read_parquet('" + str(DATA / "games.parquet") + "')").fetchone()[0])
    log("flow events:", con.execute("SELECT count(*) FROM flow").fetchone()[0])
    log("games with pbp:", con.execute("SELECT count(DISTINCT game_id) FROM flow").fetchone()[0])
    log("seasons:", con.execute("SELECT count(DISTINCT season_id) FROM flow").fetchone()[0])
    for seas in ["BAA_1946-47", "NBA_1975-76", "NBA_1995-96", "NBA_2015-16", "NBA_2025-26", "NBA_2026-27", "NBA_2040-41"]:
        n = con.execute("SELECT count(*) FROM flow WHERE season_id = ?", [seas]).fetchone()[0]
        log(f"  {seas}: flow rows {n}")


def cmd_wp(args, log=print):
    import duckdb
    con = duckdb.connect()
    con.execute(f"CREATE VIEW wpin AS SELECT * FROM read_parquet('{WPIN_DIR}/*.parquet')")
    con.execute("CREATE OR REPLACE VIEW games AS SELECT *, (home_score > away_score) AS home_won "
                f"FROM read_parquet('{DATA / 'games.parquet'}')")
    con.execute("""
        CREATE OR REPLACE TABLE agg AS
        SELECT w.era, w.sec_bucket,
               CASE WHEN w.margin < -30 THEN -30 WHEN w.margin > 30 THEN 30 ELSE w.margin END AS margin_bucket,
               count(*) AS n, sum(g.home_won::int) AS wins
        FROM wpin w JOIN games g USING (game_id)
        GROUP BY 1, 2, 3
    """)
    # fill small buckets: era-level then global
    con.execute("""
        CREATE OR REPLACE TABLE era_agg AS
        SELECT sec_bucket, margin_bucket, sum(n) n, sum(wins) wins
        FROM agg GROUP BY 1, 2
    """)
    con.execute("""
        CREATE OR REPLACE TABLE global_agg AS
        SELECT sec_bucket, sum(n) n, sum(wins) wins
        FROM agg GROUP BY 1
    """)
    out = con.execute("""
        SELECT a.era, a.sec_bucket, a.margin_bucket,
               CASE WHEN a.n >= 20 THEN a.n
                    WHEN e.n >= 20 THEN e.n ELSE g.n END AS n,
               CASE WHEN a.n >= 20 THEN a.wins
                    WHEN e.n >= 20 THEN e.wins ELSE g.wins END AS wins,
               CASE WHEN a.n >= 20 THEN 'era'
                    WHEN e.n >= 20 THEN 'era-all' ELSE 'global' END AS inherited
        FROM agg a
        JOIN era_agg e USING (sec_bucket, margin_bucket)
        JOIN global_agg g USING (sec_bucket)
    """).fetchdf()
    out["prob_home"] = (out["wins"] / out["n"]).round(4)
    out.to_parquet(DATA / "wp.parquet")
    log(f"wp: {len(out)} buckets")
    # sanity checks
    chk = con.execute("""
        WITH s AS (SELECT prob_home, margin_bucket, sec_bucket FROM read_parquet('"""
                     + str(DATA / "wp.parquet") + """') WHERE era = '14-now' AND sec_bucket = 600)
        SELECT prob_home FROM s WHERE margin_bucket = -10 UNION ALL
        SELECT prob_home FROM s WHERE margin_bucket = 10
    """).fetchall()
    log("wp sanity (-10 @600, +10 @600):", chk)


def cmd_precedents(args, log=print):
    import duckdb
    con = duckdb.connect()
    con.execute(f"CREATE VIEW flow AS SELECT * FROM read_parquet('{FLOW_DIR}/*.parquet')")
    con.execute("CREATE VIEW games AS SELECT * FROM read_parquet('" + str(DATA / "games.parquet") + "')")
    res = con.execute("""
        WITH seq AS (
            SELECT game_id, margin, seq,
                   lag(margin) OVER (PARTITION BY game_id ORDER BY seq) AS prev
            FROM flow
        ),
        g AS (
            SELECT game_id,
                   min(margin) AS min_margin,
                   max(margin) AS max_margin,
                   max(margin) - min(margin) AS swing,
                   last(margin ORDER BY seq) AS final_margin,
                   count(*) AS ev,
                   -- lead changes: count margin sign flips (ignoring 0 crossings edge)
                   sum(CASE WHEN margin > 0 AND prev <= 0 THEN 1
                            WHEN margin < 0 AND prev >= 0 THEN 1 ELSE 0 END) AS lead_changes
            FROM seq GROUP BY game_id
        ),
        q4 AS (
            SELECT game_id, margin, row_number() OVER (PARTITION BY game_id ORDER BY seq) rn
            FROM flow WHERE period = 4 AND margin != 0
        ),
        q4first AS (SELECT game_id, margin FROM q4 WHERE rn = 1)
        SELECT game_id,
               -min_margin AS comeback_15,
               CASE WHEN final_margin > 0 THEN 1 ELSE 0 END AS home_won,
               abs(final_margin) AS blowout,
               lead_changes,
               abs(final_margin - q4first.margin) AS q4_swing
        FROM g JOIN q4first USING (game_id)
    """).fetchdf()
    res.to_parquet(DATA / "allprecedents.parquet")
    # leaderboard tables
    boards = []
    def top(df, name, col, ascending=False):
        df = df.sort_values(col, ascending=ascending).head(25).reset_index(drop=True)
        df["precedent"] = name
        df["rank"] = df.index + 1
        return df
    come = res[res.home_won == 1]
    boards.append(top(come, "comeback_15", "comeback_15"))
    boards.append(top(come[come.q4_swing > 0], "comeback_4q", "comeback_15"))
    boards.append(top(res, "lead_changes_max", "lead_changes"))
    boards.append(top(res, "blowout_max", "blowout"))
    boards.append(top(res, "clutch_swing", "q4_swing"))
    import pandas as pd
    out = pd.concat(boards, ignore_index=True)
    out = out.merge(con.execute("SELECT game_id, game_date, home_team_id, away_team_id, home_score, away_score FROM games").fetchdf(),
                    on="game_id", how="left")
    out.to_parquet(DATA / "precedents.parquet")
    log("precedents:", len(out), "rows")
    for name in ["comeback_15", "lead_changes_max", "blowout_max"]:
        r = out[out.precedent == name].head(3)
        for _, x in r.iterrows():
            log(f"  {name}: {x['game_date']} {x['home_team_id']}-{x['away_team_id']} {x['home_score']}-{x['away_score']} value={x[name]}")


def cmd_release(args, log=print):
    out = DATA.parent / "release"
    out.mkdir(exist_ok=True)
    tar = out / f"every-game-ever-v{args.version}.tar.gz"
    files = ["games.parquet", "flow", "teams.parquet", "era.parquet",
             "wp.parquet", "precedents.parquet", "players-public.parquet",
             "player_games"]
    import tarfile
    with tarfile.open(tar, "w:gz") as t:
        for f in files:
            p = DATA / f
            if not p.exists():
                log(f"missing {f}"); continue
            t.add(p, arcname=p.name)
    h = hashlib.sha256(tar.read_bytes()).hexdigest()
    (out / f"every-game-ever-v{args.version}.sha256").write_text(h + "\n")
    log(f"release: {tar} ({tar.stat().st_size/1e6:.1f} MB), sha256 {h[:16]}…")


def main():
    ap = argparse.ArgumentParser(description="Every Game Ever dataset pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build")
    b.add_argument("--seasons", nargs="*", default=None)
    b.add_argument("--all", action="store_true", dest="all")
    b.add_argument("--resume", action="store_true")
    b.add_argument("--force", action="store_true")
    b.add_argument("--fail-fast", action="store_true", dest="fail_fast")

    c = sub.add_parser("check")
    c.add_argument("--license", action="store_true")

    sub.add_parser("stats")
    w = sub.add_parser("wp")
    w.add_argument("--rebuild", action="store_true")
    sub.add_parser("precedents")
    r = sub.add_parser("release")
    r.add_argument("--version", default="0.1.0")
    sub.add_parser("players")

    args = ap.parse_args()
    if args.cmd == "build":
        if args.all and args.seasons:
            ap.error("use --all OR --seasons, not both")
        if args.seasons:
            args.seasons = args.seasons[0].split(",") if len(args.seasons) == 1 else args.seasons
        cmd_build(args)
    elif args.cmd == "check":
        cmd_check(args)
    elif args.cmd == "stats":
        cmd_stats(args)
    elif args.cmd == "wp":
        cmd_wp(args)
    elif args.cmd == "precedents":
        cmd_precedents(args)
    elif args.cmd == "release":
        cmd_release(args)


if __name__ == "__main__":
    main()
