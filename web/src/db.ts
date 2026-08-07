// Lazy DuckDB-WASM wrapper over static Parquet. Boots only when needed.
import * as duckdb from "@duckdb/duckdb-wasm";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let booting: Promise<duckdb.AsyncDuckDBConnection> | null = null;

export const DATA = "data"; // served from web/public/data

export async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (conn) return conn;
  if (booting) return booting;
  booting = (async () => {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
    );
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    conn = await db.connect();
    return conn;
  })();
  return booting;
}

export async function q<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const c = await getConn();
  const run = c.query as unknown as (text: string, ...args: unknown[]) => Promise<Awaited<ReturnType<typeof c.query>>>;
  const r = await (run(sql, ...params) as Promise<Awaited<ReturnType<typeof c.query>>>);
  const rows: T[] = [];
  const cols = r.schema.fields.map((f) => f.name);
  for (let i = 0; i < r.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (const [j, col] of cols.entries()) row[col] = r.getChildAt(j)?.get(i) ?? null;
    rows.push(row as T);
  }
  return rows;
}
