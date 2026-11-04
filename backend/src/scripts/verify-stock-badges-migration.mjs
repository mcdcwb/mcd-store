import pg from "pg";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be explicitly set in the process environment.");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || decodeURIComponent(url.pathname.slice(1)) !== "mcd_store_demo") throw new Error("Refusing migration verification outside local mcd_store_demo.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const quoted = value => '"' + value.replaceAll('"', '""') + '"';
try {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(r => r.tablename);
  // Freeze the old column selection, so adding badge fields does not change hashes.
  const columns = {};
  for (const table of tables) columns[table] = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(r => r.column_name);
  async function snapshot() {
    const result = {};
    for (const table of tables) {
      const rows = (await db.query(`SELECT row_to_json(t)::text AS data FROM (SELECT ${columns[table].map(quoted).join(",")} FROM public.${quoted(table)}) t ORDER BY row_to_json(t)::text`)).rows;
      result[table] = { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
    }
    return result;
  }
  const before = await snapshot();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", windowsHide: true });
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Migration failed: ${code}`)));
  });
  if (JSON.stringify(before) !== JSON.stringify(await snapshot())) throw new Error("Existing fields changed; review concurrent application writes.");
  const row = (await db.query('SELECT "showLowStockBadge", "showLastUnitBadge" FROM "StoreSettings" WHERE id=1')).rows[0];
  if (!row || typeof row.showLowStockBadge !== "boolean" || typeof row.showLastUnitBadge !== "boolean") throw new Error("Badge settings missing after migration.");
  console.log(`Preserved all existing rows/fields in ${tables.length} tables: identical counts and SHA-256 hashes. Stock badge settings validated. No row data logged.`);
} finally { await db.end(); }
