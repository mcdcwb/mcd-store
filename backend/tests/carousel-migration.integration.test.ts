import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("carousel migration preserves existing product IDs, images, colors, stock, accounts, favorites and carts", async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const schema = "carousel_migration_" + randomUUID().replaceAll("-", "");
  const migration = "20260929000000_product_carousel";
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter(d => d.isDirectory() && d.name < migration).map(d => d.name).sort();
    for (const dir of dirs) await db.query(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
    await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Test','test@example.test','opaque',now());
      INSERT INTO "Admin" (email,"passwordHash","updatedAt") VALUES ('admin@example.test','opaque',now());
      INSERT INTO "Product" (name,price,public,category,"updatedAt") VALUES ('Existing',19.9,'unissex','camisetas',now());
      INSERT INTO "ProductColor" ("productId","colorName","colorValue","imageUrl",images) VALUES (1,'Azul','#aabbcc','/front.png',ARRAY['/back.png']);
      INSERT INTO "ProductVariant" (value,stock,"colorId") VALUES ('M',3,1);
      INSERT INTO "CartItem" ("userId","variantId",quantity) VALUES (1,1,2);
      INSERT INTO "Favorite" ("userId","productId") VALUES (1,1);`);
    const tables = ["Product", "ProductColor", "ProductVariant", "User", "Admin", "Favorite", "CartItem"];
    const before = new Map<string, unknown>();
    for (const table of tables) before.set(table, (await db.query(`SELECT * FROM "${table}"`)).rows);
    await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    for (const table of tables) {
      const rows = (await db.query(`SELECT * FROM "${table}"`)).rows;
      if (table === "Product") for (const row of rows) { assert.equal(row.inCarousel, false); delete row.inCarousel; }
      assert.deepEqual(rows, before.get(table));
    }
  } finally {
    await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});
