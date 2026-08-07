# SPEC P2 — Empirical win-probability + precedent index

## Objective
From `flow/<season>.parquet`, derive:
1. `wp.parquet` — empirical P(win) table: margin × seconds-left buckets ×
   era. Pure frequencies, license-clean (derived facts).
2. `precedents.parquet` — per-game named precedent flags + the top-N
   leaderboards the site and README use.

## Win-probability
- Input: for every game, the margin at each clock second
  (re-sample flow to integer seconds via forward-fill; only regulation +
  OT walls where clock exists; drop rows with no clock).
- Buckets: margin clipped to [-30, 30] (tails folded), clock in
  `SEC_BUCKETS = 24s` steps, era = `(season before 1980, 1980-95,
  1996-2013, 2014+)` from `season_id`.
- P(win|marg,sec,era) = count(home wins with this bucket)/count(bucket).
- Minimum-count floor: buckets with < 20 games inherit the era-agnostic
  aggregate; still < 20 → inherit global aggregate. Record `n` and
  `inherited_from` per row.
- Output columns: era, sec_remaining, margin, prob_home, n, inherited.

## Precedents
Named queries, each implemented as a DuckDB SQL in `pipeline/precedents.sql`
(shared with README docs):
1. `comeback_15` — trailed by 15+ at any point, won (max deficit).
2. `comeback_4q` — trailed by 15+ entering the 4th, won.
3. `lead_changes_max` — most lead changes in a game.
4. `blowout_max` — largest final margin.
5. `clutch_swing` — largest 4th-quarter margin swing (from start-of-4Q
   margin to end).
Output: `precedents.parquet`: game_id, precedent, value, rank.

## Acceptances
1. `pipeline/ege.py wp --rebuild` completes; `wp.parquet` has rows for
   every era and sec bucket ≥ 60s; `n` sums ≈ total games × ratio.
2. Monotonic sanity: within an era at fixed sec, P(prob) is
   non-increasing in margin buckets below 0 and non-decreasing above
   (allow 1-bucket violations; report count — must be < 1% of rows).
3. Known checks: margin=-10, sec=600, era≥2014 → prob_home < 0.5; margin
   =+10, sec=600 → prob_home > 0.5 (assert, log actual).
4. `precedents.parquet` top-5 rows print; `comeback_15` max deficit >
   25 points (historically 30+ exists — e.g., 1996 Jazz 36-point
   comeback; assert ≥ 25).
5. Everything writes under `data/current/` with manifest update; banned
   content check passes (same rule as P1).
