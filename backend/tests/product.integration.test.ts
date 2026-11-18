import "./helpers/assert-isolated-database.js";
import { fixtureCategory } from "./helpers/category.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { prisma } from "../src/lib/prisma.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
const color = (name = "Preto", stock = 3) => ({ colorName: name, colorValue: "#abcdef", imageUrl: `/${name}.png`, images: [`/${name}-back.png`], variants: [{ value: "P", stock }, { value: "GG", stock: 0 }] });
const editable = (c: any) => ({ id: c.id, colorName: c.colorName, colorValue: c.colorValue, imageUrl: c.imageUrl ?? "", images: c.images, variants: c.variants.map(({ id, value, stock }: any) => ({ id, value, stock })) });
test("nested product CRUD preserves identity, cart relations and per-color stock", async t => {
  const server = await startTestServer(createApp());
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = "TestPasswordA1-" + randomUUID();
  const ids: number[] = [];
  try {
    await createAdmin({ email, password }); const user = await createUser({ name: "Color Customer", email: userEmail, password });
    const admin = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const token = (await (await server.request("/auth/login", "POST", { email: userEmail, password })).json()).accessToken;
    const req = (path: string, method = "GET", body?: unknown) => server.request(path, method, body, admin);
    const input = { name: "Colors integration", price: 99.9, description: "Temporary", public: "unissex", categoryId: (await fixtureCategory()).id, badge: "Novo", colors: [color()] };
    let product: any;
    await t.test("creates one color and many colors with shared price and distinct variants", async () => {
      for (const colors of [[color()], [color(), color("Branco", 1), color("Verde", 4)]]) {
        const r = await req("/produtos", "POST", { ...input, colors }); assert.equal(r.status, 201);
        product = await r.json(); ids.push(product.id);
        assert.equal(product.price, "99.9"); assert.equal(product.badge, "Novo");
        assert.equal(product.colors.length, colors.length);
        assert.ok(product.colors.every((c: any) => c.colorValue === "#ABCDEF" && !("price" in c) && !("badge" in c)));
        assert.equal(new Set(product.colors.flatMap((c: any) => c.variants.map((v: any) => v.id))).size, colors.length * 2);
      }
      const listed = (await (await req("/produtos")).json()).find((p: any) => p.id === product.id);
      assert.deepEqual(listed, product);
    });
    await t.test("rejects invalid/empty colors, duplicate sizes, foreign fields and stock", async () => {
      for (const bad of [[], [{ ...color(), colorName: " " }], [{ ...color(), colorValue: "#123" }], [{ ...color(), colorValue: null }], [{ ...color(), images: [1] }], [{ ...color(), price: 1 }], [{ ...color(), badge: "wrong" }], [{ ...color(), variants: [{ value: "P", stock: 1 }, { value: " P ", stock: 1 }] }], ...[-1, 1.5, 2147483648, "3", null].map(stock => [{ ...color(), variants: [{ value: "P", stock }] }])]) {
        assert.equal((await req("/produtos", "POST", { ...input, colors: bad })).status, 400);
        assert.equal((await req(`/produtos/${product.id}`, "PUT", { name: "Must not persist", colors: bad })).status, 400);
      }
      for (const bad of [{}, { public: " " }, { categoryId: 0 }, { price: -1 }, { variants: [] }]) assert.equal((await req(`/produtos/${product.id}`, "PUT", bad)).status, 400);
      assert.equal((await req("/produtos", "POST", { ...input, colors: undefined })).status, 400);
      assert.equal((await req("/produtos", "POST", { ...input, colors: [editable(product.colors[0])] })).status, 400);
      for (const method of ["PUT", "DELETE"]) assert.equal((await req("/produtos/invalid", method, {})).status, 400);
    });
    await t.test("manual badge colors default safely, validate and persist without changing stock", async () => {
      assert.equal(product.badgeBackgroundColor, "#2457A7");
      assert.equal(product.badgeTextColor, "#FFFFFF");
      const before = product.colors;
      for (const invalid of ["red", "#fff", "#12345678", "url(test)", null]) {
        assert.equal((await req(`/produtos/${product.id}`, "PUT", { badgeBackgroundColor: invalid })).status, 400);
        assert.equal((await req("/produtos", "POST", { ...input, badgeTextColor: invalid })).status, 400);
      }
      const result = await req(`/produtos/${product.id}`, "PUT", { badge: "Novo", badgeBackgroundColor: "#abcdef", badgeTextColor: "#123456" });
      assert.equal(result.status, 200);
      product = await result.json();
      assert.equal(product.badgeBackgroundColor, "#ABCDEF");
      assert.equal(product.badgeTextColor, "#123456");
      assert.deepEqual(product.colors, before);
      const read = (await (await req("/produtos")).json()).find((p: any) => p.id === product.id);
      assert.equal(read.badgeBackgroundColor, "#ABCDEF");
      await req(`/produtos/${product.id}`, "PUT", { description: "Temporary" });
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).badgeTextColor, "#123456");
    });
    await t.test("two colors coexist in cart, enforce separate limits, merge and reject mismatched product/color", async () => {
      for (const c of product.colors.slice(0, 2)) {
        const r = await server.request("/carrinho", "POST", { productId: product.id, colorId: c.id, size: "P", quantity: 1 }, token);
        assert.equal(r.status, 200);
      }
      const white = product.colors[1];
      assert.equal((await server.request("/carrinho", "POST", { productId: product.id, colorId: white.id, size: "P", quantity: 1 }, token)).status, 409);
      assert.equal((await server.request("/carrinho", "POST", { productId: ids[0], colorId: white.id, size: "P", quantity: 1 }, token)).status, 404);
      const result = await (await server.request("/carrinho/sincronizar", "POST", { items: product.colors.slice(0, 2).map((c: any) => ({ productId: product.id, colorId: c.id, size: "P", quantity: 9 })) }, token)).json();
      assert.deepEqual(result.items.map((i: any) => i.quantity), [3, 1]);
      assert.deepEqual(result.items.map((i: any) => i.colorId), product.colors.slice(0, 2).map((c: any) => c.id));
      await server.request(`/favoritos/${product.id}`, "PUT", undefined, token);
      await server.request(`/favoritos/${product.id}`, "PUT", undefined, token);
      assert.equal((await (await server.request("/favoritos", "GET", undefined, token)).json()).length, 1);
    });
    await t.test("edits, renames, adds colors and changes stock without recreating IDs or carts", async () => {
      const previous = product;
      const colors = product.colors.map(editable); colors[0].variants[0].stock = 2; colors[0].colorName = "Preto editado";
      colors[0].variants[0].value = "M";
      colors.push(color("Azul", 5));
      const response = await req(`/produtos/${product.id}`, "PUT", { colors }); assert.equal(response.status, 200);
      product = await response.json();
      assert.deepEqual(product.colors.slice(0, 3).map((c: any) => c.id), previous.colors.map((c: any) => c.id));
      assert.equal(product.colors[0].variants[0].id, previous.colors[0].variants[0].id);
      assert.equal(product.price, previous.price); assert.equal(product.badge, previous.badge);
      const cart = (await (await server.request("/carrinho", "GET", undefined, token)).json()).items;
      assert.equal(cart.length, 2); assert.equal(cart[0].size, "M"); assert.equal(cart[0].quantity, 2);
      const patch = await req(`/produtos/${product.id}`, "PUT", { description: "Updated" });
      assert.deepEqual((await patch.json()).colors, product.colors);
    });
    await t.test("foreign/duplicate color and variant IDs fail atomically", async () => {
      const foreign = (await prisma.productColor.findMany({ where: { productId: ids[0] }, include: { variants: true } }))[0]!;
      const colors = product.colors.map(editable);
      for (const bad of [[{ ...colors[0], id: foreign.id }], [colors[0], colors[0]], [{ ...colors[0], variants: [{ ...colors[0].variants[0], id: foreign.variants[0]!.id }] }], [{ ...colors[0], variants: [{ ...colors[0].variants[0], id: colors[1].variants[0].id }] }]]) {
        assert.equal((await req(`/produtos/${product.id}`, "PUT", { name: "Must not persist", colors: bad })).status, 400);
      }
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).name, input.name);
    });
    await t.test("deleting a color removes only its variants/cart items and preserves favorites", async () => {
      const removed = product.colors[0];
      const r = await req(`/produtos/${product.id}`, "PUT", { colors: product.colors.slice(1).map(editable) }); assert.equal(r.status, 200);
      product = await r.json();
      assert.equal(await prisma.productVariant.count({ where: { colorId: removed.id } }), 0);
      const cart = (await (await server.request("/carrinho", "GET", undefined, token)).json()).items;
      assert.equal(cart.length, 1); assert.equal(cart[0].colorId, product.colors[0].id);
      assert.equal(await prisma.favorite.count({ where: { userId: user.id, productId: product.id } }), 1);
      const colors = product.colors.map(editable); colors[0].variants = [];
      assert.equal((await req(`/produtos/${product.id}`, "PUT", { colors })).status, 200);
      assert.equal(await prisma.cartItem.count({ where: { userId: user.id } }), 0);
      assert.equal((await req(`/produtos/${product.id}`, "DELETE")).status, 200);
      assert.equal(await prisma.productColor.count({ where: { productId: product.id } }), 0);
      for (const method of ["PUT", "DELETE"]) assert.equal((await req(`/produtos/${product.id}`, method, {})).status, 404);
    });
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: userEmail } }); await prisma.admin.deleteMany({ where: { email } });
    await server.close(); await prisma.$disconnect();
  }
});

test("unpublished banners accept empty price/color/variants and never reach the store, cart or favorites", async () => {
  const server = await startTestServer(createApp());
  const email = randomUUID() + "@example.test", userEmail = randomUUID() + "@example.test", password = "TestPasswordA1-" + randomUUID();
  const ids: number[] = [];
  try {
    await createAdmin({ email, password }); await createUser({ name: "Banner Customer", email: userEmail, password });
    const admin = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const token = (await (await server.request("/auth/login", "POST", { email: userEmail, password })).json()).accessToken;
    const req = (path: string, method = "GET", body?: unknown) => server.request(path, method, body, admin);
    const categoryId = (await fixtureCategory()).id;
    const banner = { name: "", price: 0, public: "unissex", categoryId, isPublished: false };

    // Sem cor informada: cria a cor interna só para guardar as imagens.
    let r = await req("/produtos", "POST", { ...banner, colors: [] }); assert.equal(r.status, 201);
    const empty = await r.json(); ids.push(empty.id);
    assert.equal(empty.price, "0");
    assert.deepEqual(empty.colors.map((c: any) => [c.colorName, c.colorValue, c.images, c.variants]), [["Banner", "#000000", [], []]]);
    // Cor só com imagens (nome/HEX vazios) também vira a cor interna, preservando as imagens.
    r = await req("/produtos", "POST", { ...banner, colors: [{ colorName: "", colorValue: "", imageUrl: "/loja.png", images: ["/loja-2.png"], variants: [] }] });
    assert.equal(r.status, 201);
    const photo = await r.json(); ids.push(photo.id);
    assert.deepEqual([photo.colors[0].colorName, photo.colors[0].colorValue, photo.colors[0].imageUrl, photo.colors[0].images], ["Banner", "#000000", "/loja.png", ["/loja-2.png"]]);
    assert.equal((await req("/produtos", "POST", { ...banner, price: -1, colors: [] })).status, 400);
    assert.equal((await req("/produtos", "POST", { ...banner, categoryId: undefined, colors: [] })).status, 400);

    // Publicar exige nome, preço > 0 e cor real, também em edição parcial.
    const internal = editable(photo.colors[0]);
    for (const body of [
      { isPublished: true },
      { isPublished: true, name: "Banner publicado" },
      { isPublished: true, name: "Banner publicado", price: 10 },
      { isPublished: true, name: "Banner publicado", price: 10, colors: [] },
      { isPublished: true, name: "Banner publicado", price: 10, colors: [{ ...internal, colorName: "" }] },
      { isPublished: true, name: "Banner publicado", price: 0, colors: [{ ...internal, colorName: "Azul", colorValue: "#0000FF" }] }
    ]) assert.equal((await req(`/produtos/${photo.id}`, "PUT", body)).status, 400, JSON.stringify(body));
    for (const body of [{ ...banner, name: "Produto novo", isPublished: true, colors: [color()] }, { ...banner, name: "Produto novo", price: 10, isPublished: true, colors: [] },
      { ...banner, name: "Produto novo", price: 10, isPublished: true, colors: [{ colorName: "Banner", colorValue: "#000000", images: [], variants: [] }] }])
      assert.equal((await req("/produtos", "POST", { colors: [], ...body })).status, 400, JSON.stringify(body));
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: photo.id } })).isPublished, false);

    // Banner já cadastrado com preço e cor reais continua funcionando como antes.
    r = await req("/produtos", "POST", { ...banner, name: "Banner antigo", price: 50, colors: [color("Vermelho")] }); assert.equal(r.status, 201);
    const legacy = await r.json(); ids.push(legacy.id);
    assert.deepEqual([legacy.price, legacy.colors[0].colorName, legacy.colors[0].colorValue, legacy.colors[0].variants.length], ["50", "Vermelho", "#ABCDEF", 2]);
    r = await req(`/produtos/${legacy.id}`, "PUT", { isPublished: true }); assert.equal(r.status, 200);
    // Publicado não pode perder o preço nem as cores.
    for (const body of [{ price: 0 }, { colors: [] }, { name: "" }]) assert.equal((await req(`/produtos/${legacy.id}`, "PUT", body)).status, 400);
    r = await req(`/produtos/${legacy.id}`, "PUT", { isPublished: false }); assert.equal(r.status, 200);

    // Não publicado: fora do catálogo, do carrinho e dos favoritos.
    const catalog = await (await server.request("/produtos", "GET")).json();
    assert.ok(ids.every(id => !catalog.some((p: any) => p.id === id)));
    const user = (path: string, method: string, body?: unknown) => server.request(path, method, body, token);
    const variant = legacy.colors[0].variants[0];
    assert.equal((await user("/carrinho", "POST", { productId: legacy.id, colorId: legacy.colors[0].id, size: variant.value, quantity: 1 })).status, 409);
    assert.equal((await user("/carrinho", "PATCH", { productId: legacy.id, colorId: legacy.colors[0].id, size: variant.value, quantity: 1 })).status, 409);
    const merged = await (await user("/carrinho/sincronizar", "POST", { items: [{ productId: legacy.id, colorId: legacy.colors[0].id, size: variant.value, quantity: 1 }] })).json();
    assert.equal(merged.items.length, 0);
    for (const selection of [{ productId: legacy.id }, { productId: legacy.id, colorId: legacy.colors[0].id, size: variant.value }, { productId: photo.id }])
      assert.equal((await user("/favoritos", "POST", selection)).status, 404);
    assert.equal((await user(`/favoritos/${legacy.id}`, "PUT")).status, 404);
    assert.equal(await prisma.favorite.count({ where: { productId: { in: ids } } }), 0);
    assert.equal(await prisma.cartItem.count({ where: { variant: { color: { productId: { in: ids } } } } }), 0);
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: userEmail } }); await prisma.admin.deleteMany({ where: { email } });
    await server.close(); await prisma.$disconnect();
  }
});
