import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
import { fixtureCategory } from "./helpers/category.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("badge API limits new text to twelve and preserves untouched legacy badges atomically", async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mcd_store_test_/);
  const server = await startTestServer(createApp());
  const email = `${randomUUID()}@example.test`, password = "Badge-" + randomUUID(); // maiúscula + número: regra de criação de admin
  let id: number | undefined;
  try {
    await createAdmin({ email, password });
    const token = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const input = { name: "Manual badge fixture", price: 30, public: "unissex", categoryId: (await fixtureCategory()).id,
      badge: "123456789012", badgeBackgroundColor: "#abcdef", badgeTextColor: "#123456",
      colors: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "P", stock: 1 }] }] };
    const invalid = await server.request("/produtos", "POST", { ...input, badge: "1234567890123" }, token);
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).errors.some((issue: any) => issue.path[0] === "badge"));
    const created = await server.request("/produtos", "POST", input, token);
    assert.equal(created.status, 201);
    const product = await created.json(); id = product.id;
    const put = (body: unknown) => server.request(`/produtos/${id}`, "PUT", body, token);
    assert.equal((await put({ badge: "1234567890123", price: 99 })).status, 400);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id } })).price.toString(), "30");
    const legacy = "LANÇAMENTO ANTIGO";
    await prisma.product.update({ where: { id }, data: { badge: legacy } });
    for (const body of [{ price: 31 }, { badge: legacy, price: 32 }]) {
      const response = await put(body); assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.badge, legacy);
      assert.equal(data.badgeBackgroundColor, "#ABCDEF"); assert.equal(data.badgeTextColor, "#123456");
      assert.deepEqual(data.colors, product.colors);
    }
    assert.equal((await put({ badge: "OUTRO BADGE LONGO", price: 99 })).status, 400);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id } })).price.toString(), "32");
    const corrected = await put({ badge: "LANÇAMENTO" }); assert.equal(corrected.status, 200);
    assert.equal((await corrected.json()).badge, "LANÇAMENTO");
    const removed = await put({ badge: null }); assert.equal(removed.status, 200);
    assert.equal((await removed.json()).badge, null);
  } finally {
    if (id) await prisma.product.delete({ where: { id } });
    await prisma.admin.deleteMany({ where: { email } });
    await server.close(); await prisma.$disconnect();
  }
});
