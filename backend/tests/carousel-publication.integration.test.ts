import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("selected drafts are public only as slides; favorites, categories and cart require publication", async t => {
  if (await prisma.product.count({ where: { inCarousel: true } }) >= 5) {
    t.skip("Existing carousel is full; preserve its selection.");
    await prisma.$disconnect(); return;
  }
  const server = await startTestServer(createApp());
  const suffix = randomUUID(), email = `slides-${suffix}@example.test`, userEmail = `slides-user-${suffix}@example.test`, password = `TestPasswordA1-${suffix}`;
  const ids: number[] = [];
  let categoryId: number | undefined;
  try {
    await createAdmin({ email, password });
    await createUser({ name: "Slides Customer", email: userEmail, password });
    const login = async (email: string) => (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const admin = await login(email), user = await login(userEmail);
    const category = await prisma.category.create({ data: { name: `Jaquetas ${suffix}`, normalizedName: `jaquetas ${suffix}` } });
    categoryId = category.id;
    const input = { name: "Future carousel jacket", price: 9999, public: "unissex", categoryId, colors: [{ colorName: "Roxo", colorValue: "#800080", images: ["/future.png"], variants: [{ value: "XGG", stock: 1 }] }] };
    const product = await (await server.request("/produtos", "POST", input, admin)).json(); ids.push(product.id);
    const other = await (await server.request("/produtos", "POST", { ...input, isPublished: false }, admin)).json(); ids.push(other.id);
    const selection = { productId: product.id, colorId: product.colors[0].id, size: "XGG", quantity: 1 };
    for (const token of [user, admin]) assert.equal((await server.request(`/favoritos/${product.id}`, "PUT", undefined, token)).status, 200);
    assert.equal((await server.request("/carrinho", "POST", selection, user)).status, 200);
    assert.equal((await server.request(`/produtos/${product.id}/carrossel`, "PATCH", { inCarousel: true }, admin)).status, 200);
    assert.equal((await server.request(`/produtos/${product.id}`, "PUT", { isPublished: false }, admin)).status, 200);
    const slidesResponse = await server.request("/produtos/carrossel");
    assert.equal(slidesResponse.status, 200);
    assert.equal(slidesResponse.headers.get("cache-control"), "no-store");
    const slides = await slidesResponse.json();
    assert.ok(slides.some((p: any) => p.id === product.id && p.isPublished === false));
    assert.ok(slides.every((p: any) => p.inCarousel));
    assert.ok(!slides.some((p: any) => p.id === other.id));
    assert.ok(slides.length <= 5);
    assert.ok(!(await (await server.request("/produtos")).json()).some((p: any) => ids.includes(p.id)));
    assert.ok(!(await (await server.request("/categorias/disponiveis")).json()).some((c: any) => c.id === categoryId));
    for (const token of [user, admin]) {
      assert.deepEqual(await (await server.request("/favoritos", "GET", undefined, token)).json(), []);
      assert.equal((await server.request(`/favoritos/${other.id}`, "PUT", undefined, token)).status, 404);
    }
    for (const method of ["POST", "PATCH"])
      assert.equal((await server.request("/carrinho", method, selection, user)).status, 409);
    const review = await (await server.request("/carrinho/conferencia", "GET", undefined, user)).json();
    assert.equal(review.items[0].product.isPublished, false); // Preserve checkout conflict information.
    const merged = await (await server.request("/carrinho/sincronizar", "POST", { items: [selection] }, user)).json();
    assert.deepEqual(merged.items, []); assert.ok(merged.notices.length > 0);
    assert.deepEqual((await (await server.request("/carrinho", "GET", undefined, user)).json()).items, []);
    await server.request(`/produtos/${product.id}`, "PUT", { isPublished: true }, admin);
    assert.ok((await (await server.request("/produtos")).json()).some((p: any) => p.id === product.id));
    for (const token of [user, admin])
      assert.equal((await (await server.request("/favoritos", "GET", undefined, token)).json())[0].product.id, product.id);
    await server.request(`/produtos/${product.id}`, "PUT", { isPublished: false }, admin);
    await server.request(`/produtos/${product.id}/carrossel`, "PATCH", { inCarousel: false }, admin);
    assert.ok(!(await (await server.request("/produtos/carrossel")).json()).some((p: any) => p.id === product.id));
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.admin.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await server.close(); await prisma.$disconnect();
  }
});
