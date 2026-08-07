# Wake-up tour — 30 seconds

**Open: <https://roham.github.io/every-game-ever/>**

1. Scroll the Atlas. Every line is a game since 1946 — 45,263 of them,
   60 seasons. Games with real play-by-play have shape; everything else
   is an honest flat line at its final margin.
2. Click into 2022-23 (the season with full play-by-play). Any line.
3. Hit **⚡ Stakes** — every moment carries its history:
   *"20 up — this exact spot has happened 25 times; the home team won
   23 (92%), the other side 8% of the time."*
4. Copy a moment link mid-replay — open it in a new tab: the replay
   seeks to that exact moment.

**The deep link that shows it all:**
<https://roham.github.io/every-game-ever/#/game/g_2022_hoopR_401469329/Q4/346>
(MIL 112–92 PHI, Q4 5:46, 2023-04-03, 92% home.)

## What was built (24h autonomous loop)

| Phase | Result |
|---|---|
| Loop engine | `.loop/` supervisor: watchdog, heartbeat, 24h wall-clock budget, headless resume, paper trail, auto mid/final reports |
| P1 dataset | 45,263 played games (1946-47 → 2025-26), flow for 1,224 games, era fingerprints, teams, players — facts-only, license-checked |
| P2 win-probability | 2,588 buckets (era × period × 24s × 3-pt margins) + neighbor smoothing; precedents boards (blowouts, scoring, lead changes, comebacks) |
| P3 web | Atlas / Time Machine replay / Stakes / Precedents / constellation search — static, DuckDB-WASM, moment permalinks |
| P4 release | v0.1.0→0.1.4 bundles + GitHub Pages deploy (CI rebuilds from latest release) |

Evidence: `docs/` (STORIES, GREATEST-2022-23, ERAS, DATA-COVERAGE,
DATA-LICENSE, schema, duckdb-queries) + `.loop/phases.log` +
`docs/WAKEUP-REPORT.md` (regenerates at mid/final marks).

## Honest caveats

- PBP exists for ONE season in the source (2022-23); 73 of its games
  end early in the source and ship with no claimed final.
- The record lacks 1996–2013 and 2023-24/24-25 games; the Atlas shows
  the gap.
- Team names on the t_nba id convention: 21/30 arena-derived, 9 "??".
- WP small-n cells are disclosed in captions (n shown).
- Roadmap for day-2: `docs/FUTURE.md` (balldontlie quarter scores top
  of the list — needs the API key from the approved subscription).
