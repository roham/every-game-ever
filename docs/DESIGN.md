# Design — Every Game Ever

Approved direction: **The Time Machine** (public showcase, open source).
Revised per Fable 5 consultation (2026-08-07). Decision record.

## The asset
76,050 NBA/BAA games (1946-11-01 → present), 14,531,607 play-by-play rows
(clock, score-after, shot flags, action), 5,769 players, 215 teams,
30,171 transactions, Wikidata Q-number entity spine. Source:
`nba_reference` Supabase project (wewmolsrxrpajrzjqvim).

## License boundary
Public artifacts contain FACTS ONLY: scores, schedules, flow derived from
score-after values, empirical aggregates. No descriptions, no narratives,
no internal ids (qids, Top Shot), no licensed feeds. Phase 2 (coordinates,
shot charts) routes through balldontlie (approved, $40/mo).

## The product
- **Name:** Every Game Ever ("the name is the pitch").
- **Landing = the Atlas:** all 76k games as mini flow-lines tiled by
  season; camera-move intro from one iconic game to the whole texture.
- **Replay:** compressed 45s default; scoreboard ticks event-by-event;
  lead-flip pings; era badges; scrubber; 1x easter egg.
- **Stakes:** empirical win-probability (margin × clock × era) with
  "this exact situation has occurred N times" captions.
- **Moment permalinks:** a URL for every moment
  (`#/1998-06-14/CHI-UTA/Q4/0:37`), unfurl-ready title.
- **Careers as constellations:** player's games glowing across the Atlas.
- **Precedent search:** named queries (comeback_15, etc.) → leaderboards.

## Architecture
- **Dataset-first:** `pipeline/ege.py build` → Parquet (games, flow by
  season, teams, era, wp, precedents, players). Deterministic,
  license-checked, reproducible.
- **Static site:** Vite + TS + canvas; Atlas from pre-rendered JSON
  sprites; DuckDB-WASM lazy for game/precedent/player queries.
- **Loop management (24h autonomous build):** `.loop/supervisor.sh`
  watchdog + heartbeat + wall-clock kill switch + headless resume;
  state in `.loop/state.json`; paper trail in `.loop/phases.log`;
  reports to `docs/WAKEUP-REPORT.md`.

## Deferred (post-v1)
- Shot coordinates / heatmaps via balldontlie.
- Live scores (turn the historical machine into a tonight machine).
- OG share-card generation at scale (curated set first).
