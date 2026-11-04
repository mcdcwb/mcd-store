import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be explicitly set in the process environment.");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || decodeURIComponent(url.pathname.slice(1)) !== "mcd_store_demo") throw new Error("Refusing migration verification outside local mcd_store_demo.");
const db = new pg.Client({ connectionString: databaseUrl });
const tables = ["ProductColor", "ProductVariant", "Favorite", "CartItem", "User", "Admin", "UserAddress", "StoreSettings"];
const digest = rows => createHash("sha256").update(JSON.stringify(rows, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest("hex");
await db.connect();
try {
  const database = (await db.query("SELECT current_database() AS name")).rows[0].name;
  const current = process.argv.includes("--current") || process.argv.includes("--check-current");
  const path = join(tmpdir(), `lowen-category-migration-${database}-${current ? "current" : "before"}.json`);
  const after = process.argv.includes("--after") || process.argv.includes("--check-current");
  const products = (await db.query(after && !current
    ? 'SELECT p.*, c.name AS category FROM "Product" p JOIN "Category" c ON c.id=p."categoryId" ORDER BY p.id'
    : 'SELECT * FROM "Product" ORDER BY id')).rows;
  if (after && !current) {
    assert.equal(products.length, Number((await db.query('SELECT count(*) FROM "Product"')).rows[0].count), "Every product must have a category");
    for (const p of products) { assert.equal(p.isPublished, true); delete p.categoryId; delete p.isPublished; }
  }
  const hashes = {};
  for (const table of current ? [...tables, "Category"] : tables) {
    const rows = (await db.query(`SELECT * FROM "${table}" ORDER BY to_jsonb("${table}")::text`)).rows;
    hashes[table] = { count: rows.length, hash: digest(rows) };
  }
  const totalStock = Number((await db.query('SELECT coalesce(sum(stock),0) AS stock FROM "ProductVariant"')).rows[0].stock);
  const snapshot = { database, productsHash: digest(products), productCount: products.length, totalStock, tables: hashes };
  if (after) assert.deepEqual(snapshot, JSON.parse(await readFile(path, "utf8")));
  else await writeFile(path, JSON.stringify(snapshot));
  const categories = current ? (await db.query('SELECT name FROM "Category" ORDER BY id')).rows.map(c => c.name) : [...new Set(products.map(p => p.category))];
  console.log(JSON.stringify({ verified: after, ...snapshot, categories }, null, 2));
} finally { await db.end(); }
