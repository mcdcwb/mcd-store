import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { prisma } from "../src/lib/prisma.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("categories enforce ADMIN CRUD, unique normalized names, FK protection and publication/stock availability", async t => {
  const server = await startTestServer(createApp());
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = "TestPasswordA1-" + randomUUID();
  const categoryIds: number[] = [], productIds: number[] = [];
  try {
    await createAdmin({ email, password }); await createUser({ name: "Category User", email: userEmail, password });
    const admin = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const user = (await (await server.request("/auth/login", "POST", { email: userEmail, password })).json()).accessToken;
    const req = (path: string, method = "GET", body?: unknown) => server.request(path, method, body, admin);
    const name = "Acessórios " + randomUUID();
    let category: { id: number; name: string }, other: { id: number; name: string }, product: any;
    await t.test("USER and unauthenticated cannot read administrative lists or mutate categories", async () => {
      for (const [token, status] of [[undefined, 401], [user, 403]] as const) {
        for (const [path, method, body] of [["/categorias", "GET", undefined], ["/categorias", "POST", { name }], ["/categorias/1", "PUT", { name }], ["/categorias/1", "DELETE", undefined], ["/produtos/admin", "GET", undefined]] as const)
          assert.equal((await server.request(path, method, body, token)).status, status);
      }
      assert.equal((await server.request("/categorias/disponiveis")).status, 200);
    });
    await t.test("ADMIN creates, lists, trims and rejects empty, long, duplicate and Unicode-equivalent names", async () => {
      const response = await req("/categorias", "POST", { name: `  ${name}  ` }); assert.equal(response.status, 201);
      category = await response.json(); categoryIds.push(category.id); assert.equal(category.name, name);
      assert.deepEqual(Object.keys(category).sort(), ["id", "name", "productCount"]);
      assert.equal((category as any).productCount, 0);
      assert.ok((await (await req("/categorias")).json()).some((c: any) => c.id === category.id));
      for (const duplicate of [name.toUpperCase(), ` ${name.replace(" ", "   ")} `, name.normalize("NFD")]) assert.equal((await req("/categorias", "POST", { name: duplicate })).status, 409);
      for (const bad of ["", " ", "x".repeat(81), null]) assert.equal((await req("/categorias", "POST", { name: bad })).status, 400);
      const result = await req("/categorias", "POST", { name: "Outra " + randomUUID() }); other = await result.json(); categoryIds.push(other.id);
      assert.equal((await req(`/categorias/${other.id}`, "PUT", { name: name.toUpperCase() })).status, 409);
    });
    await t.test("new category is used on create and edit; category change preserves colors and variant identities", async () => {
      const input = { name: "Category product", price: 10, public: "unissex", categoryId: category.id, isPublished: true,
        colors: [{ colorName: "Preto", colorValue: "#112233", images: ["/category.png"], variants: [{ value: "P", stock: 0 }, { value: "M", stock: 3 }] }] };
      assert.equal((await req("/produtos", "POST", { ...input, categoryId: 2147483647 })).status, 400);
      const created = await req("/produtos", "POST", input); assert.equal(created.status, 201); product = await created.json(); productIds.push(product.id);
      assert.equal(product.categoryId, category.id); assert.equal(product.category.name, name);
      const changed = await req(`/produtos/${product.id}`, "PUT", { categoryId: other.id }); assert.equal(changed.status, 200);
      const updated = await changed.json(); assert.equal(updated.categoryId, other.id); assert.deepEqual(updated.colors, product.colors);
      const listed = await (await req("/categorias")).json();
      assert.equal(listed.find((c: any) => c.id === other.id).productCount, 1);
      assert.equal(listed.find((c: any) => c.id === category.id).productCount, 0);
      await req(`/produtos/${product.id}`, "PUT", { categoryId: category.id });
    });
    await t.test("renames retain associations, and referenced categories cannot be deleted even when hidden", async () => {
      const result = await req(`/categorias/${category.id}`, "PUT", { name: name + " Editada" }); assert.equal(result.status, 200);
      assert.equal((await (await req("/produtos/admin")).json()).find((p: any) => p.id === product.id).category.name, name + " Editada");
      assert.equal((await req(`/categorias/${category.id}`, "DELETE")).status, 409);
      assert.equal(await prisma.product.count({ where: { id: product.id } }), 1);
      assert.equal((await req(`/categorias/${other.id}`, "DELETE")).status, 200);
      assert.equal((await req(`/categorias/${other.id}`, "DELETE")).status, 404);
    });
    const available = async () => (await (await server.request("/categorias/disponiveis")).json()).some((c: any) => c.id === category.id);
    await t.test("public availability follows all colors, stock exhaustion/restock and publication", async () => {
      assert.equal(await available(), true);
      await prisma.productVariant.updateMany({ where: { color: { productId: product.id } }, data: { stock: 0 } });
      assert.equal(await available(), false);
      assert.ok((await (await req("/categorias")).json()).some((c: any) => c.id === category.id));
      assert.equal((await (await req("/categorias")).json()).find((c: any) => c.id === category.id).productCount, 1);
      await prisma.productVariant.update({ where: { id: product.colors[0].variants[1].id }, data: { stock: 1 } });
      assert.equal(await available(), true);
      await req(`/produtos/${product.id}`, "PUT", { isPublished: false }); assert.equal(await available(), false);
      assert.equal((await (await req("/categorias")).json()).find((c: any) => c.id === category.id).productCount, 1);
      assert.equal((await (await server.request("/produtos")).json()).some((p: any) => p.id === product.id), false);
      assert.equal((await (await req("/produtos/admin")).json()).some((p: any) => p.id === product.id), true);
      assert.equal((await req(`/categorias/${category.id}`, "DELETE")).status, 409);
      await req(`/produtos/${product.id}`, "PUT", { isPublished: true }); assert.equal(await available(), true);
      const publicCategories = await (await server.request("/categorias/disponiveis")).json();
      assert.deepEqual(Object.keys(publicCategories.find((c: any) => c.id === category.id)).sort(), ["id", "name"]);
    });
    await t.test("administrative counts include every associated product regardless of stock and publication", async () => {
      const extra = await prisma.product.create({ data: { name: "Hidden category count fixture", price: 10, public: "unissex", categoryId: category.id, isPublished: false,
        colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: { value: "M", stock: 0 } } } } } });
      productIds.push(extra.id);
      const listed = await (await req("/categorias")).json();
      assert.equal(listed.find((c: any) => c.id === category.id).productCount, 2);
      assert.equal((await req(`/categorias/${category.id}`, "DELETE")).status, 409);
    });
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.admin.deleteMany({ where: { email } }); await prisma.user.deleteMany({ where: { email: userEmail } });
    await server.close(); await prisma.$disconnect();
  }
});
