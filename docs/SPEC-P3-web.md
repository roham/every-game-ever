# SPEC P3 — Web client (the Time Machine)

## Objective
Static Vite + TypeScript + canvas client, no backend, reading Parquet via
DuckDB-WASM. Three surfaces: **Atlas** (landing), **Game replay**,
**Career constellation**, plus **precedent search** UI and **moment
permalinks**.

## Build-time pipeline
- `web/scripts/build-atlas.ts`: reads `data/current` → emits
  `web/public/atlas/<season>.json` (per-game: id, date, teams, final,
  margin array downsampled to ≤ 120 points) + `web/public/atlas/index.json`
  (season ordering, counts). Pre-rendered static sprites: on page load the
  Atlas paints from index.json without DuckDB.
- DuckDB-WASM boots lazily only when a game view or precedent search
  needs full parquet (`wp.parquet`, `precedents.parquet`,
  `flow/<season>.parquet`, `games.parquet`).

## Surfaces
1. **Atlas (landing)**: rows of mini flow-lines per season (canvas, ~250px
   rows), seasons stacked chronologically; hover shows game tooltip
   (date, teams, final); click opens replay. Also a "camera move" intro:
   first visit, animate from one iconic game line to the full texture.
2. **Replay**: scoreboard (home/away ticking), differential line drawing
   over game clock; default compressed ~45s with speed control (1x, 2x,
   8x, 45s); lead-flip pings; era badge; scrubber; WP overlay toggle
   (line of prob_home from wp.parquet for the game's era/margin);
   "this exact situation" caption (n and count of trailing-team wins).
3. **Moment permalinks**: hash routes `#/GAME_KEY/QT/SS` &
   `#/YYYY-MM-DD/HOME-AWAY/Q/SS` (resolve date+teams → game_id); deep-seek
   replay to that moment in 1x; update hash as playhead moves (throttled);
   copy-link button; document.title becomes "LAL 87 - CHI 93 · Q4 0:37".
4. **Career constellation**: search box (player name; data:
   `players-public.parquet` generated in P1+ as name, bbref_slug, career
   seasons, games list — verify it exists; if missing, regenerate in P1
   or P3 gate as `pipeline/ege.py players`). Selected player: their games
   glow across the Atlas rows; click → replay.
5. **Precedent search**: the five named precedents from P2 as cards →
   leaderboard table (top 25) with links into replays.

## Styling
Dark, athletic, obsessively legible. One accent color for the leading
team's line, one for trailing; WP line in a complementary hue. No
framework beyond TS + canvas (deal with resize, devicePixelRatio,
prefers-reduced-motion: skip intro animation).

## Acceptances
1. `npm ci && npm run build` clean; `npm run preview` serves; curl of `/`
   returns 200 and index.html references hashed assets.
2. `npx tsc --noEmit` clean.
3. Visual verification (Chrome MCP or playwright screenshot):
   - Atlas renders ≥ 3 season rows with distinguishable lines.
   - Replay of a known game (e.g., 1998-06-14 Bulls–Jazz G6) runs; WP
     overlay draws; lead flip pings fire; scrubber seeks; permalink
     `#/1998-06-14/CHI-UTA/Q4/0:37` lands playhead at that moment
     (scoreboard ≈ real 87-86 moment — verify against games.parquet).
   - Career constellation: search "Kareem" → games glow; click → replay.
   - Precedent card opens top-5 with working links.
   - Mobile width 390px: atlas rows scrollable, replay controls usable.
4. Lighthouse-ish sanity: no console errors on load (check devtools
   console), first Atlas paint < 2s on localhost.
