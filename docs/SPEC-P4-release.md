# SPEC P4 — Public release + deploy

## Objective
Make Every Game Ever a real open-source repository and a live site:
dataset release, docs, deploy, verification.

## Tasks
1. **Docs final**
   - `docs/DATA-LICENSE.md` — facts-only statement + provenance note
     (sources: NBA/BAA box scores; no copyrighted prose; no licensed
     feeds in public artifacts; balldontlie phase 2 note).
   - `docs/duckdb-queries.md` — the five surprising queries (from
     `pipeline/precedents.sql` + 5 more: career arcs, era pace,
     longest games, Wilt 100 context, closest finals series by flow
     distance) — each with expected result sample.
   - `docs/schema.md` — every parquet table: columns, types, cardinality,
     provenance. "Document the schema like you're proud of it."
   - README final: pitch, screenshot (from P3 visual verify), quickstart
     (one-command build from release bundle), dataset badge.
2. **Public dataset bundle**
   - `pipeline/ege.py release` → `data/release/every-game-ever-<ver>.tar.gz`
     + sha256: only `games/flow/teams/era/wp/precedents/players`
     parquet + schema.md + DATA-LICENSE.md. Re-run license check on the
     bundle contents. Verify `duckdb -c` can query the bundle off-line.
3. **GitHub**
   - Repo `roham/every-game-ever` (public) — already created at kickoff.
   - Push main; create GitHub Release v0.1.0 with the bundle attached
     (gh release create).
4. **Deploy site**
   - Prefer **GitHub Pages** (no new credentials): `npm run build` →
     `web/dist`; workflow `.github/workflows/pages.yml` (static upload);
     enable Pages for the repo via API/gh; verify `https://roham.github.io/
     every-game-ever/` returns 200 and the atlas paints (Chrome MCP).
   - Fallback chain if Pages blocked: Vercel via `gh secret`-stored token
     — check GSM `magic-vercel-token`; deploy + alias; document URL.
   - Document the URL in README + WAKEUP report.
5. **Post-deploy verification**
   - curl 200 on `/`, `/atlas/index.json`; load site in Chrome MCP,
     screenshot Atlas + one replay; no console errors; share-link copy
     works.

## Acceptances
1. `gh release list` shows v0.1.0 with bundle asset; sha256 matches
   local bundle.
2. Fresh-clone test: `git clone` into /tmp, `npm ci`, bundle un-tar,
   `duckdb` sample query from docs/duckdb-queries.md returns rows.
3. Public URL loads; screenshots saved to `docs/screenshots/` and
   committed.
4. README quickstart works verbatim (scripted test).
