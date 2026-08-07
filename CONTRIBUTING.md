# Contributing to Every Game Ever

Small, honest, working. The project ships facts and says what it does not
know. Keep both properties.

## Data

- Never add narrative prose to the dataset. Facts only.
- New lanes (e.g., balldontlie quarter scores, shot coordinates) land in
  `pipeline/` with a license note in `docs/DATA-LICENSE.md` BEFORE data.
- Coverage claims live in `docs/DATA-COVERAGE.md` and must be updated in
  the same commit that changes the data.

## Pipeline

- `python ege.py build --all && python ege.py check --license` must pass
  before any release; the check's final-score audit must stay at 0
  mismatches (games are skipped when `flow_complete=false` — they make
  no final claim).
- Outputs must stay deterministic: same source → same files.
- `ege.py release` is the only way the bundle ships. A release commit
  pins its sha256.

## Web

- `npm run typecheck` and `npm run build` must pass.
- duckdb-wasm loads from jsdelivr at runtime; keep the pinned version in
  `src/db.ts` in sync with whatever `node_modules` provides.
- Browser-verify with real data before claiming a UI feature done:
  atlas → replay → precedents, at mobile width too.

## Loops

- `.loop/supervisor.sh` manages the autonomous build loop (heartbeat,
  budget, resume). Never disable the wall-clock budget.
- Every milestone: `touch .loop/heartbeat`, one line into
  `.loop/phases.log`, commit.

## Releases

vX.Y.Z → bundle → sha256 → GitHub release → Pages deploy (CI rebuilds
the atlas from the release bundle). Verify the live URL before closing
the release.
