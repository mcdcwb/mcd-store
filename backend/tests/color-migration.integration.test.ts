import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("migration preserves legacy products, variant IDs, nonempty carts, favorites and identities", async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const schema = "migration_" + randomUUID().replaceAll("-", "");
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET search_path TO "${schema}"`);
    const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
    for (const dir of dirs.filter(d => d < "20260922000000_product_colors")) await db.query(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
    await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Test','test@example.test','opaque',now());
      INSERT INTO "Admin" (email,"passwordHash","updatedAt") VALUES ('admin@example.test','opaque',now());
      INSERT INTO "Product" (name,price,public,category,"colorName","colorValue","imageUrl",images,"updatedAt") VALUES ('Legacy',19.9,'unissex','camisetas','Azul','#aabbcc','/front.png',ARRAY['/back.png'],now()),('Missing color',10,'unissex','camisetas',NULL,NULL,NULL,ARRAY[]::text[],now());
      INSERT INTO "ProductVariant" (value,stock,"productId") VALUES ('P',3,1),('GG',0,1);
      INSERT INTO "CartItem" ("userId","variantId",quantity) VALUES (1,1,2);
      INSERT INTO "Favorite" ("userId","productId") VALUES (1,1);`);
    const tables = ['User','Admin','CartItem','Favorite']; const before: Record<string, unknown> = {};
    for (const table of tables) before[table] = (await db.query(`SELECT * FROM "${table}"`)).rows;
    await db.query(await readFile("prisma/migrations/20260922000000_product_colors/migration.sql", "utf8"));
    for (const table of tables) assert.deepEqual((await db.query(`SELECT * FROM "${table}"`)).rows, before[table]);
    const colors = (await db.query('SELECT * FROM "ProductColor" ORDER BY "productId"')).rows;
    assert.equal(colors.length, 2); assert.equal(colors[0].colorName, 'Azul'); assert.equal(colors[0].colorValue, '#aabbcc');
    assert.equal(colors[0].imageUrl, '/front.png'); assert.deepEqual(colors[0].images, ['/back.png']);
    assert.equal(colors[1].colorName, 'Cor não informada'); assert.equal(colors[1].colorValue, '#000000');
    const variants = (await db.query('SELECT * FROM "ProductVariant" ORDER BY id')).rows;
    assert.deepEqual(variants.map(v => [v.id,v.value,v.stock,v.colorId]), [[1,'P',3,colors[0].id],[2,'GG',0,colors[0].id]]);
    assert.equal((await db.query('SELECT * FROM "CartItem" ci JOIN "ProductVariant" v ON v.id=ci."variantId" JOIN "ProductColor" c ON c.id=v."colorId"')).rowCount,1);
    await assert.rejects(db.query('UPDATE "ProductVariant" SET stock=-1 WHERE id=1'));
  } finally {
    await db.query('ROLLBACK'); await db.query('SET search_path TO public');
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.end();
  }
});
