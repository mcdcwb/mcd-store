import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("category migration preserves every legacy row and relation and merges normalized names", async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const schema = "category_migration_" + randomUUID().replaceAll("-", "");
  const migration = "20261004000000_dynamic_categories";
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET search_path TO "${schema}"`);
    for (const dir of (await readdir("prisma/migrations")).filter(dir => dir < migration && /^\d/.test(dir)).sort())
      await db.query(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
    await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Test','test@example.test','opaque',now());
      INSERT INTO "Product" (name,price,public,category,"updatedAt") VALUES ('Legacy',19.9,'unissex','Calças',now()),('Another',20,'feminino',' calças ',now()),('Custom',10,'infantil','Acessórios',now());
      INSERT INTO "ProductColor" ("productId","colorName","colorValue","imageUrl",images) VALUES (1,'Azul','#aabbcc','/front.png',ARRAY['/back.png']);
      INSERT INTO "ProductVariant" (value,stock,"colorId") VALUES ('M',3,1),('P',0,1);
      INSERT INTO "CartItem" ("userId","variantId",quantity) VALUES (1,1,2);
      INSERT INTO "Favorite" ("userId","productId") VALUES (1,1);`);
    const tables = ["Product", "ProductColor", "ProductVariant", "User", "Admin", "Favorite", "CartItem", "StoreSettings"];
    const before = new Map<string, any[]>();
    for (const table of tables) before.set(table, (await db.query(`SELECT * FROM "${table}"`)).rows);
    await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    const names = (await db.query('SELECT id, "normalizedName" FROM "Category"')).rows;
    assert.equal(names.length, 2);
    for (const table of tables) {
      const rows = (await db.query(`SELECT * FROM "${table}"`)).rows;
      if (table === "Product") for (const row of rows) {
        const old = before.get(table)!.find(p => p.id === row.id);
        assert.equal(names.find(c => c.id === row.categoryId).normalizedName, old.category.trim().toLowerCase());
        assert.equal(row.isPublished, true); delete row.categoryId; delete row.isPublished; row.category = old.category;
      }
      assert.deepEqual(rows, before.get(table));
    }
    await assert.rejects(db.query('DELETE FROM "Category" WHERE id=(SELECT "categoryId" FROM "Product" WHERE id=1)'), { code: "23503" });
  } finally {
    await db.query("ROLLBACK"); await db.query("SET search_path TO public"); await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.end();
  }
});
