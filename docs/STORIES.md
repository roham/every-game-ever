# Stories the record tells

Every line below was produced by querying the shipped dataset —
`duckdb` against the release bundle. Where the source record has gaps,
we say so.

## The biggest regular-season blowout in the record

```
2021-12-02   Memphis 152 - 79 Oklahoma City   (+73)
```

No other regular-season game in the shipped record approaches it. The
closest challengers are 1991-12-17 (+68) and 1972-03-19 (+63).
(Team names on the t_nba id convention are arena-derived from the
covered games: 21 of 30 teams named, 9 honest "??".)

## The modern scoring high-water mark

```
2023-02-25   175 - 176   (351 combined, regulation)
```

Per the play-by-play record we ship: a 2022-23 regulation game that
touched 351 points. (The era table agrees: 2022-23 averages **229.6
points per game** — the fastest modern season in the record, next to
1969-70's 232.7.)

## The most lead changes in the play-by-play era

```
2023-01-19   108 - 126   36 lead changes
2022-11-02   110 - 107   35
2023-02-04   118 - 112   35
```

The 2022-23 season (the only season with full play-by-play in the
source record) swings hard: the top-10 all have 31+ lead changes.

## The biggest comeback in the record

Trailed by 27, won by 2 (2025-10-10 slice), with the 2022-23 full-flow
champion trailing by 24 and winning (2023-02-16, 117-113). The
"trailed entering the 4th and won" family is where the wp table earns
its caption: "this exact spot has happened N times; the trailing team
won M."

## Eras, as fingerprints

| era (by season) | avg total pts (games>500) |
|---|---|
| 1969-70 | 232.7 |
| 2022-23 | 229.6 |
| 1995-96 | 198.4 |
| 1949-50 | 160.1 |

And close games: 2022-23 had 302 games decided by ≤3 (26% of the
season) against 81 in 1960-61 (24%) — the league has been trading
blowouts for buzzers since the 1940s.

## Caveats

- Team-name mapping across id conventions (espn/nba/bbref eras) is
  partially resolved; `t_unknown` rows carry no names in the source.
- 73 of 1,176 play-by-play games end early in the source play-by-play;
  they ship with `flow_complete=false` and no claimed final.
- The 1996-2013 and 2023-24/2024-25 seasons are absent from the source
  game table; the Atlas shows the honest gap.
