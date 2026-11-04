import pg from "pg";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be explicitly set in the process environment.");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || decodeURIComponent(url.pathname.slice(1)) !== "mcd_store_demo") throw new Error("Refusing migration verification outside local mcd_store_demo.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(r => r.tablename);
  async function snapshot() {
    const result = {};
    for (const table of tables) {
      const name = '"' + table.replaceAll('"', '""') + '"';
      const rows = (await db.query(`SELECT row_to_json(t)::text AS data FROM ${name} t ORDER BY row_to_json(t)::text`)).rows;
      result[table] = { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
    }
    return result;
  }
  const before = await snapshot();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", windowsHide: true });
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Migration failed: ${code}`)));
  });
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing data changed during migration; review concurrent writes.");
  console.log(`Verified identical counts and SHA-256 hashes for all ${tables.length} existing tables. No row data logged.`);
} finally { await db.end(); }
