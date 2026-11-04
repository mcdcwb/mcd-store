import "./helpers/assert-isolated-database.js";
import { initialBusinessHours } from "../src/lib/business-hours.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("global settings default, validation, ADMIN authorization and persistence in an isolated schema", async t => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mcd_store_test_/);
  const schema = "settings_test_" + randomUUID().replaceAll("-", "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const isolated = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }) });
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = randomUUID();
  const server = await startTestServer(createApp({ settingsDatabase: isolated }));
  const original = await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await db.query(await readFile("prisma/migrations/20261001000000_store_settings/migration.sql", "utf8"));
    await db.query(await readFile("prisma/migrations/20261005000000_store_business_details/migration.sql", "utf8"));
    await db.query('UPDATE "StoreSettings" SET "lowStockThreshold"=7, "storeStreet"=\'Existing Street\', whatsapp=\'5541999999999\'');
    const beforeMigration = (await db.query('SELECT * FROM "StoreSettings"')).rows[0];
    await db.query(await readFile("prisma/migrations/20261006010000_store_business_hours/migration.sql", "utf8"));
    const { businessHours: migratedHours, ...afterMigration } = (await db.query('SELECT * FROM "StoreSettings"')).rows[0];
    assert.deepEqual(afterMigration, beforeMigration); assert.deepEqual(migratedHours, initialBusinessHours);
    const beforeBadges = (await db.query('SELECT * FROM "StoreSettings"')).rows[0];
    await db.query(await readFile("prisma/migrations/20261007000000_stock_badges/migration.sql", "utf8"));
    const { showLowStockBadge, showLastUnitBadge, ...afterBadges } = (await db.query('SELECT * FROM "StoreSettings"')).rows[0];
    assert.deepEqual(afterBadges, beforeBadges);
    assert.equal(showLowStockBadge, true); assert.equal(showLastUnitBadge, true);
    await db.query('UPDATE "StoreSettings" SET "lowStockThreshold"=5, "storeStreet"=NULL, whatsapp=NULL');
    await createAdmin({ email, password });
    await createUser({ name: "Settings Test", email: userEmail, password });
    const admin = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const user = (await (await server.request("/auth/login", "POST", { email: userEmail, password })).json()).accessToken;
    for (const method of ["GET", "PUT"]) for (const [token, status] of [[undefined, 401], [user, 403]] as const)
      assert.equal((await server.request("/settings", method, method === "PUT" ? { lowStockThreshold: 10 } : undefined, token)).status, status);
    assert.deepEqual(await (await server.request("/settings", "GET", undefined, admin)).json(), { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true });
    for (const lowStockThreshold of [0, -1, 1.5, 10000, "5", "", null, "NaN"])
      assert.equal((await server.request("/settings", "PUT", { lowStockThreshold }, admin)).status, 400);
    for (const body of [{}, { lowStockThreshold: 10, id: 2 }]) assert.equal((await server.request("/settings", "PUT", body, admin)).status, 400);
    for (const value of [1, 9999, 10]) {
      const response = await server.request("/settings", "PUT", { lowStockThreshold: value }, admin);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { lowStockThreshold: value, showLowStockBadge: true, showLastUnitBadge: true });
      assert.deepEqual(await (await server.request("/settings", "GET", undefined, admin)).json(), { lowStockThreshold: value, showLowStockBadge: true, showLastUnitBadge: true });
      assert.equal((await db.query('SELECT "lowStockThreshold" FROM "StoreSettings" WHERE id=1')).rows[0].lowStockThreshold, value);
    }
    await t.test("independent stock badge switches are strict, ADMIN-only and preserve other settings", async () => {
      for (const field of ["showLowStockBadge", "showLastUnitBadge"] as const) {
        for (const invalid of [0, 1, "true", "false", null])
          assert.equal((await server.request("/settings", "PUT", { [field]: invalid }, admin)).status, 400);
        for (const [token, status] of [[undefined, 401], [user, 403]] as const)
          assert.equal((await server.request("/settings", "PUT", { [field]: false }, token)).status, status);
        for (const value of [false, true]) {
          const before = await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
          const response = await server.request("/settings", "PUT", { [field]: value }, admin);
          assert.equal(response.status, 200); assert.equal((await response.json())[field], value);
          assert.deepEqual(await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } }), { ...before, [field]: value });
          assert.equal((await (await server.request("/settings/public")).json())[field], value);
        }
      }
      await server.request("/settings", "PUT", { showLowStockBadge: false, showLastUnitBadge: false }, admin);
      const response = await server.request("/settings", "PUT", { lowStockThreshold: 3 }, admin);
      assert.deepEqual(await response.json(), { lowStockThreshold: 3, showLowStockBadge: false, showLastUnitBadge: false });
      await server.request("/settings", "PUT", { lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true }, admin);
    });
    const address = { cep: "80000-000", street: "Rua Teste", number: "123", complement: "Sala 2", neighborhood: "Centro", city: "Curitiba", state: "pr" };
    const details = { address, whatsapp: "(41) 99999-9999" };
    for (const method of ["GET", "PUT"]) for (const [token, status] of [[undefined, 401], [user, 403]] as const)
      assert.equal((await server.request("/settings/store", method, method === "PUT" ? details : undefined, token)).status, status);
    assert.deepEqual(await (await server.request("/settings/public")).json(), { address: null, whatsapp: null, businessHours: initialBusinessHours, lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
    for (const method of ["PUT", "POST", "PATCH", "DELETE"])
      assert.equal((await server.request("/settings/public", method, details, admin)).status, 405);
    for (const body of [ { ...details, whatsapp: "abc" }, { ...details, whatsapp: "123" }, { ...details, address: { ...address, cep: "123" } },
      { ...details, address: { ...address, street: "" } }, { ...details, address: { ...address, state: "ZZ" } }, { ...details, lowStockThreshold: 50 } ])
      assert.equal((await server.request("/settings/store", "PUT", body, admin)).status, 400);
    const expected = { businessHours: initialBusinessHours, address: { ...address, cep: "80000000", state: "PR" }, whatsapp: "5541999999999" };
    assert.deepEqual(await (await server.request("/settings/store", "PUT", details, admin)).json(), expected);
    assert.deepEqual(await (await server.request("/settings/public")).json(), { ...expected, lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
    assert.deepEqual(await (await server.request("/settings/store", "GET", undefined, admin)).json(), expected);
    assert.equal((await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).whatsapp, expected.whatsapp);
    assert.equal((await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).lowStockThreshold, 10);
    await server.request("/settings", "PUT", { lowStockThreshold: 10 }, admin);
    assert.deepEqual(await (await server.request("/settings/public")).json(), { ...expected, lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
    await t.test("weekly hours are public, ADMIN configurable and preserve all other settings", async () => {
      const schedule = { ...structuredClone(initialBusinessHours), WEDNESDAY: { isOpen: false }, TUESDAY: { isOpen: true, openingTime: "10:00", closingTime: "19:30" } };
      const before = await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
      for (const [token, status] of [[undefined, 401], [user, 403]] as const)
        assert.equal((await server.request("/settings/store", "PUT", { businessHours: schedule }, token)).status, status);
      const response = await server.request("/settings/store", "PUT", { businessHours: schedule }, admin);
      assert.equal(response.status, 200);
      const saved = await response.json(); assert.deepEqual(saved.address, expected.address); assert.equal(saved.whatsapp, expected.whatsapp);
      assert.deepEqual(saved.businessHours.WEDNESDAY, { isOpen: false, openingTime: null, closingTime: null });
      assert.equal(saved.businessHours.TUESDAY.closingTime, "19:30");
      const after = await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
      const { businessHours: ignoredBefore, ...otherBefore } = before;
      const { businessHours: ignoredAfter, ...otherAfter } = after;
      assert.deepEqual(otherAfter, otherBefore);
      assert.deepEqual(await (await server.request("/settings/store", "GET", undefined, admin)).json(), saved);
      const publicResponse = await server.request("/settings/public");
      assert.equal(publicResponse.headers.get("cache-control"), "no-store");
      const visible = await publicResponse.json(); assert.deepEqual(visible, { ...saved, lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
      assert.deepEqual(Object.keys(visible).sort(), ["address", "businessHours", "lowStockThreshold", "showLastUnitBadge", "showLowStockBadge", "whatsapp"]);
      await server.request("/settings/store", "PUT", details, admin);
      assert.deepEqual((await (await server.request("/settings/public")).json()).businessHours, saved.businessHours);
      await server.request("/settings/store", "PUT", { businessHours: initialBusinessHours }, admin);
    });
    await t.test("strict seven-day shape, booleans, HH:mm, required times and same-day ordering", async () => {
      const invalidDays = [
        { isOpen: true, openingTime: "25:00", closingTime: "18:00" },
        { isOpen: true, openingTime: "09:00", closingTime: "12:99" },
        { isOpen: true, openingTime: "abc", closingTime: "18:00" },
        { isOpen: true, openingTime: "9 horas", closingTime: "18:00" },
        { isOpen: true, openingTime: "9:00", closingTime: "18:00" },
        { isOpen: true, openingTime: "09:00:00", closingTime: "18:00" },
        { isOpen: true, openingTime: "18:00", closingTime: "02:00" },
        { isOpen: true, openingTime: "09:00", closingTime: "09:00" },
        { isOpen: true }, { isOpen: true, openingTime: null, closingTime: null },
        { isOpen: "true", openingTime: "09:00", closingTime: "18:00" },
        { isOpen: false, openingTime: "09:00", closingTime: "18:00" },
        { isOpen: false, extra: true }, null
      ];
      const before = await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
      for (const day of invalidDays) {
        const response = await server.request("/settings/store", "PUT", { businessHours: { ...initialBusinessHours, MONDAY: day } }, admin);
        assert.equal(response.status, 400); const error = await response.json(); assert.ok(error.errors.length > 0);
        assert.ok(error.error.includes("Segunda-feira"));
      }
      const { SUNDAY, ...missingDay } = initialBusinessHours;
      for (const businessHours of [missingDay, {}, [], null, { ...initialBusinessHours, HOLIDAY: SUNDAY }])
        assert.equal((await server.request("/settings/store", "PUT", { businessHours }, admin)).status, 400);
      assert.equal((await server.request("/settings/store", "PUT", {}, admin)).status, 400);
      assert.deepEqual(await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } }), before);
      for (const [openingTime, closingTime] of [["00:00", "23:59"], ["18:00", "23:00"], ["09:00", "18:30"]]) {
        const businessHours = { ...initialBusinessHours, MONDAY: { isOpen: true, openingTime, closingTime } };
        assert.equal((await server.request("/settings/store", "PUT", { businessHours }, admin)).status, 200);
      }
      await server.request("/settings/store", "PUT", { businessHours: initialBusinessHours }, admin);
    });
    await t.test("migration preserves prior fields and database rejects invalid direct JSON writes", async () => {
      for (const value of [null, {}, [], { ...initialBusinessHours, MONDAY: { isOpen: true, openingTime: "25:00", closingTime: "26:00" } }, { ...initialBusinessHours, SUNDAY: { isOpen: false } }])
        await assert.rejects(db.query('UPDATE "StoreSettings" SET "businessHours"=$1::jsonb WHERE id=1', [JSON.stringify(value)]));
      assert.deepEqual((await isolated.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).businessHours, initialBusinessHours);
    });
    await server.request("/settings/store", "PUT", { address: null, whatsapp: null }, admin);
    assert.deepEqual(await (await server.request("/settings/public")).json(), { address: null, whatsapp: null, businessHours: initialBusinessHours, lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
    const otherSession = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    assert.deepEqual(await (await server.request("/settings", "GET", undefined, otherSession)).json(), { lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true });
    await assert.rejects(db.query('INSERT INTO "StoreSettings" (id) VALUES (2)'));
    await assert.rejects(db.query('UPDATE "StoreSettings" SET "lowStockThreshold"=0'));
    assert.deepEqual(await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } }), original);
  } finally {
    await server.close();
    await isolated.$disconnect();
    await prisma.admin.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
    await prisma.$disconnect();
  }
});
