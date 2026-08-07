# SPEC P1 — Dataset pipeline (games / flow / teams / era)

## Objective
Build `pipeline/ege.py` (subcommands `build`, `check`, `stats`) deriving a
facts-only public dataset from the internal `nba_reference` Supabase
Postgres: games, per-game flow series, teams, era aggregates — as Parquet,
bucketed by season for the flow table.

## Inputs
- Credentials (env): `SUPABASE_NBA_REFERENCE_DB_URL` (postgres direct,
  psycopg2) and `SUPABASE_NBA_REFERENCE_URL`/`KEY` (PostgREST fallback).
  Hydrate from GSM: `gcloud secrets versions access latest
  --secret=magic-supabase-nba-reference-db-url --project=dl-ai-pantheon`.
  (On Roham's Mac the `.env`-style values are also fetchable the same way;
  do not hardcode secrets anywhere.)
- Tables: `nba_reference.nba_games` (game_id, game_date, season_id,
  game_type, home/away team ids, scores, playoff_round, attendance,
  duration, overtime), `nba_reference.nba_plays` (game_id, period,
  clock_seconds_remaining, action, action_subtype, shot_made, shot_value,
  home_score_after, away_score_after, description — description and qids
  must NEVER be written to public outputs), `nba_reference.nba_seasons`,
  `nba_reference.nba_teams`.

## Derived outputs (`data/current/`, gitignored until release)
- `games.parquet`: game_id, date, season_id, game_type, home_team_id,
  away_team_id, home_score, away_score, ot (bool), playoff_round, source.
- `flow/<season_id>.parquet`: game_id, period, clock_remaining_s, margin
  (=home-away after), event (enum: score_home|score_away|lead_change|
  period_start), seq. Derived from plays: use score_after deltas (drop
  rows where neither side scored), clock buckets; margin series per game.
- `teams.parquet`: team_id, name, first_season, last_season, games_count.
- `era.parquet`: season_id, games_count, avg_margin_abs, lead_changes_per
  game, comebacks_15 (trailed by 15+ at any point and won), avg_ot_count.
- `manifest.json`: build time, source counts, per-table row counts,
  sha256 of every file, pipeline version, data license pointer.

## Constraints
- No descriptions, no qids, no Top Shot ids, no narrative text anywhere
  in outputs. Fail the build if any of these strings appear in output
  columns (a `--license-check` pass scans column names + sampled values).
- Determinism: identical source → identical outputs (sort rows, stable
  hashing).
- Recoverable: `build --resume` re-derives only missing seasons.

## Acceptances (run exactly these)
1. `pipeline/.venv/bin/python pipeline/ege.py build --limit-seasons 1980-81,2025-26`
   completes cleanly and writes the files above.
2. `pipeline/ege.py check` — sampled games (500 random): recompute final
   scores from `flow/<season>.parquet` last margin + game final margin;
   must match games.parquet 100%; print failure rate (must be 0).
3. `pipeline/ege.py stats` prints totals; for the two test seasons play
   counts must be > 0 and > 2,000 plays each.
4. License check passes (no banned column names / sample values).
5. Full `build` over ALL seasons completes within the phase time budget
   (it streams per season; parallel seasons with `--workers 4`).
