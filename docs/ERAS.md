# Eras, as fingerprints

From `era.parquet` (seasons with >500 games in the record).

## Scoring pace — the league's heart rate

| peak | season | avg total pts |
|---|---|---|
| **1969-70** | fastest | 232.7 |
| 2022-23 | modern | 229.6 |
| 1995-96 | defensive era | 198.4 |
| **1949-50** | slowest | 160.1 |

## Close games — the share of the season decided by ≤3

| season | within-3 | share |
|---|---|---|
| 1960-61 | 81 / 341 | 24% |
| 1980-81 | 220 / 996 | 22% |
| **2022-23** | **302 / 1,176** | **26%** |
| 2025-26 (slice) | 8 / 48 | 17% |

The league has spent the last sixty years trading blowouts for buzzers —
then one season (2022-23, the one with real play-by-play) shipped the
buzzer-est of them all: **LA 175 – 176 SAC, 2OT, 36 lead changes** (see
[STORIES](STORIES.md)).

## What this table does NOT say

- The 1996–2013 and 2023-24/24-25 gaps are ABSENT from the source record
  (see [DATA-COVERAGE](DATA-COVERAGE.md)) — the era table cannot judge
  what the record does not contain.
- 2025-26 shows only the 48-game slice that the source carries.

Run it yourself:

```sql
SELECT season_id, games, avg_total_pts, avg_margin, games_within_3, ot_games
FROM 'era.parquet' WHERE games > 500 ORDER BY avg_total_pts DESC;
```
