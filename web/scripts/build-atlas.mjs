// build-atlas: derive per-season atlas JSON (downsampled margins) from the
// flow parquet + copy needed parquet files into web/public/data.
// Usage: node scripts/build-atlas.mjs [dataDir]
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const duckdb = require("duckdb");
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DATA = path.resolve(process.argv[2] ?? path.join(ROOT, "data", "current"));
const PUBLIC = path.join(ROOT, "web", "public");
const ATLAS_DIR = path.join(PUBLIC, "atlas");
const DATA_DIR = path.join(PUBLIC, "data");

fs.mkdirSync(ATLAS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "flow"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "player_games"), { recursive: true });

const db = new duckdb.Database(":memory:");
const q = (sql, ...params) =>
  new Promise((res, rej) =>
    db.all(sql, ...params, (err, rows) => (err ? rej(err) : res(rows))));

// team id -> abbreviation (teams.parquet has no abbr in public build; derive
// from id suffix as a readable fallback + try bbref via games? keep id).
const gamesPath = path.join(DATA, "games.parquet");
const dir = `${DATA}/flow/*.parquet`;

const seasons = await q(`SELECT DISTINCT season_id FROM read_parquet('${dir}') ORDER BY season_id`);

const index = { seasons: [], counts: {} };
for (const { season_id } of seasons) {
  const rows = await q(
    `SELECT game_id, home_score, away_score, date(game_date) AS d,
            home_team_id h, away_team_id a
     FROM read_parquet('${gamesPath}') WHERE season_id = ?`,
    season_id,
  );
  const flow = await q(
    `SELECT game_id, margin FROM read_parquet('${dir}')
     WHERE season_id = ? ORDER BY game_id, seq`,
    season_id,
  );
  const byGame = new Map();
  for (const f of flow) {
    if (!byGame.has(f.game_id)) byGame.set(f.game_id, []);
    byGame.get(f.game_id).push(f.margin);
  }
  const maxLen = 200;
  const games = [];
  for (const g of rows) {
    let m = byGame.get(g.game_id) ?? [];
    let down = m;
    if (m.length > maxLen) {
      down = [];
      for (let i = 0; i < maxLen; i++) {
        down.push(m[Math.min(m.length - 1, Math.floor((i / maxLen) * m.length))]);
      }
    }
    if (!down.length) {
      // no PBP: honest flat line at the final margin (blowout texture)
      const fin = Math.max(-30, Math.min(30, (g.home_score ?? 0) - (g.away_score ?? 0)));
      down = [fin, fin];
    }
    games.push({ id: g.game_id, d: g.d ?? "", h: g.h ?? "", a: g.a ?? "", hs: g.home_score, as: g.away_score, m: down, r: byGame.has(g.game_id) ? 1 : 0 });
  }
  fs.writeFileSync(path.join(ATLAS_DIR, `${season_id}.json`), JSON.stringify({ season: season_id, games }));
  index.seasons.push(season_id);
  index.counts[season_id] = games.length;
  console.log(`${season_id}: ${games.length} games`);
}

fs.writeFileSync(path.join(ATLAS_DIR, "index.json"), JSON.stringify(index));

// stage parquet for runtime (duckdb-wasm range queries)
const copy = [
  "games.parquet", "wp.parquet", "precedents.parquet",
  "players-public.parquet", "teams.parquet", "era.parquet",
];
for (const f of copy) {
  const src = path.join(DATA, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA_DIR, f));
}
for (const f of fs.readdirSync(path.join(DATA, "flow"))) {
  fs.copyFileSync(path.join(DATA, "flow", f), path.join(DATA_DIR, "flow", f));
}
for (const f of fs.readdirSync(path.join(DATA, "player_games"))) {
  fs.copyFileSync(path.join(DATA, "player_games", f), path.join(DATA_DIR, "player_games", f));
}
console.log("atlas + data staged; total atlas dir bytes:", 
  fs.readdirSync(ATLAS_DIR).reduce((n, f) => n + fs.statSync(path.join(ATLAS_DIR, f)).size, 0));
