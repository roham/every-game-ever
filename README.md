# Every Game Ever

**All 76,050 NBA games since 1946, as data and as a replayable record.**
Every play, every score, every clock tick — reconstructed from 14,531,607
play-by-play rows. Click any game and watch it come back to life: the
scoreboard ticks, the lead swings, and every moment is judged against
every other moment in league history.

- **The Atlas** — every game as a flow line, tiled by season. Zoom from
  all of basketball history to one game.
- **The Time Machine** — replay any game ever: compressed 45-second
  default, scrubber, era badges ("1962 — no 3pt line").
- **Stakes** — empirical win-probability derived from the full corpus:
  "down 14 with 5:10 left has been seen 312 times; the trailing team won 9."
- **Moment links** — a URL for every moment: `#/1998-06-14/CHI-UTA/Q4/0:37`.
- **Careers as constellations** — every game a player ever played, glowing
  across the Atlas (Wikidata-linked player resolution).

## The dataset

Facts-only, license-clean, reproducible. `pipeline/ege.py build` derives
everything from the source database; the public release under GitHub
Releases ships pure Parquet — scores, flows, teams, era stats — with
nothing copyrighted in it (no prose, no internal joins).

Five queries that make it worth opening DuckDB for:

```sql
-- biggest comebacks ever (trailed by most, won)
SELECT * FROM flow
```
*(full queries land in `docs/duckdb-queries.md` during Phase 4)*

## Status

Loop-built autonomously (2026-08-07 — 24h budget). See `docs/WAKEUP-REPORT.md`.

## License

Code: MIT. Data: facts (scores/schedules) — see `docs/DATA-LICENSE.md`.
