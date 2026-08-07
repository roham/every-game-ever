# Schema — the Every Game Ever dataset

Every table is Parquet, sorted, deterministic (same source → same bytes).
All values are facts of public record; nothing here is copyrighted prose.

## games.parquet — every played game (45,263 rows)

| column | type | notes |
|---|---|---|
| game_id | string | stable id; `g_2022_hoopR_<nba>`, `g_<year>_<hash>` styles |
| game_date | string | ISO date (null only for play-reconstructed rows) |
| season_id | string | real season label derived from date ("2022-23") |
| source_season_id | string | the raw ETL tag on the source row |
| game_type | string | regular / playoffs / preseason |
| home_team_id, away_team_id | string | team ids (conventions vary by era) |
| home_score, away_score | int | final |
| playoff_round | int? | null unless playoffs |
| overtime_periods | int? | 0/1.., null when unknown |
| attendance | int? | null when unknown |
| venue_name | string? | arena when the source had it |

## flow/<season_id>.parquet — scoring-event replay series

One row per scoring event (score-after change), chronological by `seq`.

| column | type | notes |
|---|---|---|
| game_id | string | |
| season_id | string | |
| period | int | 1-4 regulation, 5+ OT |
| clock_remaining_s | int? | seconds left in the period at the event |
| home_score, away_score | int | running totals after the event |
| margin | int | home − away |
| event | string | score_home / score_away / first / score |
| seq | int | monotonic event index within the game |

Currently covers 2022-23 (+ the 48-game 2025-26 slice) — see
DATA-COVERAGE.md.

## era.parquet — per-season aggregate fingerprint (59 seasons)

games, avg_total_pts, avg_margin, games_within_3, ot_games,
avg_attendance, ev (flow events), games_with_pbp (flow presence).

## wp.parquet — empirical win probability

era × period × sec_bucket(24s) × margin_bucket(±30): `n`, `wins`,
`prob_home`, `inherited` (era | era-all | global — small-sample fills).

## precedents.parquet — the corpus judging itself

`precedent` ∈ blowout_max / highest_scoring / lead_changes_max /
comeback_15. Columns: game_id, value, rank, game_date, team ids +
abbreviations, final score, season_id.

## teams.parquet — 215 team identities across conventions

team_id, abbreviation?, current_name?, bbref_slug?, nba_stats_team_id?,
first/last season ids.

## players-public.parquet — 5,415 players, public facts only

bbref_slug, full_name, common_name, positions, debut/final dates, HOF.

## player_games/<season>.parquet — game memberships

bbref_slug × game_id (currently empty for 2022-23: the PBP lane carries
no player ids; the surface degrades honestly).
