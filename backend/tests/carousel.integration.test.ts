import "./helpers/assert-isolated-database.js";
import { fixtureCategory } from "./helpers/category.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("carousel persists, authorizes ADMIN and enforces five even with concurrent requests", async () => {
  const server = await startTestServer(createApp());
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = randomUUID();
  const ids: number[] = [];
  try {
    await createAdmin({ email, password });
    await createUser({ name: "Carousel Customer", email: userEmail, password });
    const admin = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const user = (await (await server.request("/auth/login", "POST", { email: userEmail, password })).json()).accessToken;
    const input = { name: "Carousel integration", price: 10, public: "unissex", categoryId: (await fixtureCategory()).id, colors: [{ colorName: "Preto", colorValue: "#111111", images: ["/image.png"], variants: [{ value: "M", stock: 2 }] }] };
    for (let i = 0; i < 6; i++) {
      const response = await server.request("/produtos", "POST", input, admin);
      assert.equal(response.status, 201);
      const product = await response.json(); ids.push(product.id); assert.equal(product.inCarousel, false);
    }
    const path = (id: number) => `/produtos/${id}/carrossel`;
    for (const [token, status] of [[undefined, 401], [user, 403]] as const)
      assert.equal((await server.request(path(ids[0]!), "PATCH", { inCarousel: true }, token)).status, status);
    assert.equal((await server.request(path(2147483647), "PATCH", { inCarousel: true }, admin)).status, 404);
    for (const body of [{}, { inCarousel: "true" }, { inCarousel: true, name: "Invalid" }])
      assert.equal((await server.request(path(ids[0]!), "PATCH", body, admin)).status, 400);
    // Ordinary CRUD cannot bypass the dedicated endpoint's shared lock.
    assert.equal((await server.request(`/produtos/${ids[0]}`, "PUT", { inCarousel: true }, admin)).status, 400);
    assert.equal((await server.request("/produtos", "POST", { ...input, inCarousel: true }, admin)).status, 400);
    const initial = await prisma.product.count({ where: { inCarousel: true } });
    const before = await prisma.product.findUniqueOrThrow({ where: { id: ids[0] }, include: { colors: { include: { variants: true } } } });
    const results = await Promise.all(ids.map(id => server.request(path(id), "PATCH", { inCarousel: true }, admin)));
    assert.equal(results.filter(r => r.status === 200).length, 5 - initial);
    assert.equal(results.filter(r => r.status === 409).length, 1 + initial);
    assert.equal(await prisma.product.count({ where: { inCarousel: true } }), 5);
    const selected = await prisma.product.findMany({ where: { id: { in: ids }, inCarousel: true } });
    const id = selected[0]!.id;
    assert.equal((await server.request(path(id), "PATCH", { inCarousel: true }, admin)).status, 200);
    const publicProducts = await (await server.request("/produtos")).json();
    assert.equal(publicProducts.find((p: any) => p.id === id).inCarousel, true);
    const selectedInOrder = await prisma.product.findMany({ where: { inCarousel: true }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], select: { id: true } });
    const reorderedIds = selectedInOrder.map(product => product.id).reverse();
    for (const [token, status] of [[undefined, 401], [user, 403]] as const)
      assert.equal((await server.request("/produtos/carrossel/ordem", "PATCH", { productIds: reorderedIds }, token)).status, status);
    const reorderResponse = await server.request("/produtos/carrossel/ordem", "PATCH", { productIds: reorderedIds }, admin);
    assert.equal(reorderResponse.status, 200);
    assert.deepEqual((await reorderResponse.json()).map((product: any) => product.id), reorderedIds);
    assert.deepEqual(await prisma.product.findMany({ where: { inCarousel: true }, orderBy: { carouselPosition: "asc" }, select: { id: true } }).then(items => items.map(product => product.id)), reorderedIds);
    assert.deepEqual(await server.request("/produtos/carrossel").then(response => response.json()).then((items: any[]) => items.map(product => product.id)), reorderedIds);
    assert.equal((await server.request("/produtos/carrossel/ordem", "PATCH", { productIds: reorderedIds.slice(1) }, admin)).status, 409);
    assert.equal((await server.request("/produtos/carrossel/ordem", "PATCH", { productIds: [...reorderedIds, reorderedIds[0]] }, admin)).status, 400);
    assert.equal((await server.request(path(id), "PATCH", { inCarousel: false }, admin)).status, 200);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id } })).inCarousel, false);
    const compacted = await prisma.product.findMany({ where: { inCarousel: true }, orderBy: { carouselPosition: "asc" }, select: { id: true, carouselPosition: true } });
    assert.deepEqual(compacted.map(product => product.carouselPosition), compacted.map((_, index) => index));
    assert.equal((await server.request(path(id), "PATCH", { inCarousel: true }, admin)).status, 200);
    const appended = await prisma.product.findUniqueOrThrow({ where: { id } });
    assert.equal(appended.carouselPosition, compacted.length);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: ids[0] }, include: { colors: { include: { variants: true } } } });
    assert.deepEqual(after.colors, before.colors);
    assert.equal((await server.request(`/produtos/${id}`, "DELETE", undefined, admin)).status, 200);
    assert.equal(await prisma.product.count({ where: { inCarousel: true } }), 4);
    const afterDelete = await prisma.product.findMany({ where: { inCarousel: true }, orderBy: { carouselPosition: "asc" }, select: { carouselPosition: true } });
    assert.deepEqual(afterDelete.map(product => product.carouselPosition), [0, 1, 2, 3]);
    const unselected = await prisma.product.findFirstOrThrow({ where: { id: { in: ids }, inCarousel: false } });
    assert.equal((await server.request(path(unselected.id), "PATCH", { inCarousel: true }, admin)).status, 200);
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.admin.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await server.close(); await prisma.$disconnect();
  }
});
