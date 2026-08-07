# Data coverage — the honest map

Verified 2026-08-07 directly against `nba_reference` (Supabase
`wewmolsrxrpajrzjqvim`).

## What the source contains

| Layer | Extent | Status |
|---|---|---|
| Game rows (nba_games) | 76,050 total rows; **44,087 played** (scored) | full |
| Played games coverage | 59 seasons, 1946-47 → 2025-26 (gaps: several seasons missing — e.g. 2005-06, 2022-23 rows unscored) | partial |
| **Real play-by-play (nba_plays)** | **553,944 plays, one season: 2022-23** (hoopR-sourced, `g_2022_hoopR_*` ids), plus 48 additional games under 2025-26 dates | single season |
| Placeholder "plays" | ~11.6M rows under `g_19xx_shuf_*` / `g_20xx_shuf_*` ids with NULL scores — synthetic schedule rows, NOT real PBP | excluded |
| Players | 5,769, all qid-resolved | full |

## What Every Game Ever ships

1. **games.parquet** — all 44,087 played games: date, teams, final, OT,
   attendance, type. Complete history of the league's box-score record.
2. **flow/<season>.parquet** — true intra-game score flow for **2022-23
   (+ the 48 rescued games)**: every scoring event with clock. This is the
   full-replay layer, honestly labeled.
3. **era.parquet** — season aggregates across ALL 59 seasons, computed
   from finals: scoring pace, average margin, OT rates, close-game share.
4. **wp.parquet** — empirical win-probability, computed from the real-PBP
   season (modern-era reference), margin × clock buckets.
5. **precedents.parquet** — finals-derived leaderboards across all 59
   seasons (blowouts, highest scoring, OT) + flow-derived shapes where
   PBP exists (lead changes, biggest deficits).
6. **players-public.parquet / player_games** — public player facts +
   game memberships for the PBP season.

## Why it's shaped this way

The source database was built as an internal encyclopedia; its
play-by-play lane covers only the hoopR-derived season, while game
schedules/scores span nearly all of history. Rather than fake the rest,
Every Game Ever shows **what the record has**: every final score ever,
replay where the record is deep, and precedents judged across all of it.
A balldontlie-backed enrichment pass (quarter scores for all seasons) is
the Phase-2 path to give the pre-PBP era real shape (see DESIGN.md).
