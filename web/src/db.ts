// Lazy DuckDB-WASM over static Parquet. Boots only when needed.
// The WASM lib loads from jsdelivr at runtime (bundler-free; verified path —
// vite's bundling of the lib produced broken instantiations).
import type * as DuckModule from "@duckdb/duckdb-wasm";

const DDB_URL = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

type DuckLib = typeof DuckModule;
type AnyConn = { query(text: string, ...args: unknown[]): Promise<unknown> };
let conn: AnyConn | null = null;
let booting: Promise<AnyConn> | null = null;

export const DATA = "data";

// duckdb-wasm httpfs needs absolute URLs and has no glob support.
// Resolve against the page DIRECTORY (subpath-safe: GitHub Pages hosts the
// site under /every-game-ever/, localhost under /).
export const P = (p: string): string => {
  const base = window.location.href.split("#")[0] || window.location.href;
  const dir = base.endsWith("/") ? base : base + "/";
  return new URL(p, dir).href;
};
export const FLOW_FILES = [P("data/flow/2022-23.parquet"), P("data/flow/2025-26.parquet")];
export const PLAYER_GAME_FILES = [P("data/player_games/2022-23.parquet"), P("data/player_games/2025-26.parquet")];

async function boot(): Promise<AnyConn> {
  // Dynamic-import exception: the module specifier is a runtime CDN URL.
  // Static bundling of duckdb-wasm breaks its wasm instantiation (verified).
  const duckdb = (await import(/* @vite-ignore */ DDB_URL)) as DuckLib;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(worker_url);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);
  return db.connect() as Promise<AnyConn>;
}

export async function getConn(): Promise<AnyConn> {
  if (conn) return conn;
  if (booting) return booting;
  booting = boot();
  return booting;
}

export async function q<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const c = await getConn();
  const r = (await c.query(sql, ...params)) as {
    schema: { fields: { name: string }[] };
    numRows: number;
    getChildAt(i: number): { get(i: number): unknown } | null;
  };
  const rows: T[] = [];
  const cols = r.schema.fields.map((f) => f.name);
  for (let i = 0; i < r.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (const [j, col] of cols.entries()) {
      const v = r.getChildAt(j)?.get(i);
      // duckdb-wasm returns INTs as BigInt; coerce to keep client math sane.
      row[col] = typeof v === "bigint" ? Number(v) : v ?? null;
    }
    rows.push(row as T);
  }
  return rows;
}
