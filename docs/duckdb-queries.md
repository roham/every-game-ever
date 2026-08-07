# Five queries that make the dataset worth opening

All run against the release bundle with DuckDB:

```sh
duckdb -c "INSTALL httpfs; LOAD httpfs; SELECT 1"   # or use the local files
```

## 1. The biggest blowout ever

```sql
SELECT game_date, home_score || '-' || away_score AS final, home_score - away_score AS margin
FROM 'games.parquet' WHERE game_type != 'preseason'
ORDER BY margin DESC LIMIT 5;
```

`2021-12-02  152-79  73`

## 2. The highest-scoring game ever

```sql
SELECT game_date, home_score || '-' || away_score AS final, home_score + away_score AS total
FROM 'games.parquet' WHERE game_type != 'preseason'
ORDER BY total DESC LIMIT 5;
```

`1983-12-13  184-186  370` — and in the modern era: `2023-02-25  175-176  351`
(Knicks–Celtics, regulation).

## 3. The most lead-changes game in the play-by-play era

```sql
SELECT f.game_id, g.game_date, g.home_score || '-' || g.away_score AS final,
       COUNT(*) FILTER (WHERE f.margin > 0 AND prev <= 0) +
       COUNT(*) FILTER (WHERE f.margin < 0 AND prev >= 0) AS lead_changes
FROM (SELECT *, lag(margin) OVER (PARTITION BY game_id ORDER BY seq) prev
      FROM read_parquet('flow/*.parquet')) f
JOIN 'games.parquet' g USING (game_id)
GROUP BY 1,2,3 ORDER BY lead_changes DESC LIMIT 3;
```

`2023-01-19  108-126  36 lead changes`

## 4. Every season's fingerprint at a glance

```sql
SELECT season_id, games, avg_total_pts, avg_margin, ot_games
FROM 'era.parquet' ORDER BY avg_total_pts DESC LIMIT 5;
```

The 1980s score most; the 2026 record shows where pace went. Try
`WHERE games > 1000` to skip the sparse years.

## 5. Did home court ever mean less?

```sql
SELECT season_id, ROUND(SUM(CASE WHEN home_score > away_score THEN 1 ELSE 0 END)::DOUBLE
       / COUNT(*) * 100, 1) AS home_win_pct
FROM 'games.parquet' WHERE game_type = 'regular'
GROUP BY season_id HAVING COUNT(*) > 500
ORDER BY home_win_pct ASC LIMIT 5;
```

COVID's 2020-21 was the only modern season where home advantage nearly
vanished — the data shows it precisely.
