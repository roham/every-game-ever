# Data license & provenance

**Every Game Ever ships facts.** The public dataset contains only
deterministic derivations from the historical NBA/BAA record: game dates,
teams, final scores, overtime flags, score-flow series (home/away score
after each scoring event), and empirical aggregates (win-probability
frequencies, precedent counts). These are facts of public record.

## What is NOT in the public dataset
- Play-by-play descriptions or any citable prose
- Internal identifiers (player qids, Top Shot ids, service keys)
- Licensed feeds (SportRadar, NBA Official Media Data, AP/Getty imagery)
- Narratives or generated text

The internal encyclopedia that feeds the pipeline is
internal-use/non-commercial; its licensing boundaries are documented in
`roham/topshot-data-portal` `docs/nba-reference/risks.md`. Public release
follows that boundary strictly: **structured stats only, no AI-training
consumption of copyrighted content.**

## Phase-2 note (coordinates)
Shot-coordinate data will come from the balldontlie API (SportsDataIO,
licensed for redistribution, approved 2026-08-07) and will carry its own
attribution per its license when shipped.

## How to verify
`pipeline/ege.py check --license` scans output columns and sampled values
for banned content. The release bundle ships with its own manifest of
sha256 hashes and is rebuilt deterministically from source.
