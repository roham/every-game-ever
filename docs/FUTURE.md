# Next moves (day-2+)

What the loop recommends next, in value order, all inside the
license boundary:

1. **Quarter scores for all 59 seasons (balldontlie lane)** — the one
   move that gives the pre-PBP era real shape in the Atlas (4-5 anchor
   points per game instead of a flat final line). Requires the
   BALLDONTLIE_API_KEY (Ralph-approved subscription) — not present on
   this machine at build time; the lane is spec'd in the pipeline
   conventions. This also unlocks "trailed entering the 4th and won"
   for the ENTIRE record, not just the flow season.
2. **Verified team-name map for the t_nba convention** — a static
   30-row id→abbr table (public facts) to replace the arena-derived
   partial (21/30) resolution.
3. **OG share cards per iconic game** — the curated set (top-25 games
   by flow/precedent) with unfurl-ready images; generic card covers
   the rest.
4. **Live scores** — turn the historical machine into a tonight
   machine (new lane, requires a licensed live feed — balldontlie
   again).
5. **The search/constellation upgrade** — game-level player data lands
   the day a PBP source with player ids (balldontlie PBP) is wired.
6. **Site**: "Freshest" landing board, mobile controls polish, i18n
   of the captions. Low risk, incremental.

## Operational notes for the operator

- Heatbeat/budget/watchdog: `.loop/supervisor.sh` — the wall-clock
  budget is 24h by design; never disable it.
- Releases: `ege.py release --version X` then `gh release create` —
  the Pages workflow tracks the latest release automatically.
- Honesty invariants (do not regress): final-score audit must stay 0
  mismatches; `flow_complete=false` games must never claim a final;
  `--license` must stay clean.
