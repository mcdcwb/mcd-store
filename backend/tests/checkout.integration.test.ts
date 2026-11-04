import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser } from "../src/services/user.service.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
import { categoryRelation } from "./helpers/category.js";
import { storeDetailsData } from "../src/services/settings.service.js";
import { prepareCheckoutWhatsapp } from "../src/services/checkout.service.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("checkout persists orders without changing cart/stock and confirms atomically", async t => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mcd_store_test_/, "Use tests/helpers/run-isolated.mjs, never the real database.");
  const schema = "checkout_test_" + randomUUID().replaceAll("-", "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const isolated = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }) });
  const password = randomUUID(), email = randomUUID() + "@example.test", adminEmail = randomUUID() + "@example.test";
  const server = await startTestServer(createApp({ settingsDatabase: isolated }));
  let productId: number | undefined;
  const address = { cep: "80000000", street: "Rua São João", number: "123", complement: "Apto 7", neighborhood: "Centro", city: "Curitiba", state: "PR" };
  const pickupAddress = { ...address, street: "Rua da Loja", number: "456", complement: "" };
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET search_path TO "${schema}"`);
    for (const migration of ["20261001000000_store_settings", "20261005000000_store_business_details", "20261006010000_store_business_hours", "20261007000000_stock_badges"])
      await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    const user = await createUser({ name: "João da Silva", email, password });
    await createAdmin({ email: adminEmail, password });
    const login = async (email: string) => (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const token = await login(email), admin = await login(adminEmail);
    const req = (path: string, method = "GET", body?: unknown) => server.request(path, method, body, token);
    const review = async () => (await (await req("/checkout")).json());
    const context = (method: string) => ({ customerName: "João da Silva", address: method === "DELIVERY" ? address : null,
      pickupAddress: method === "PICKUP" ? pickupAddress : null, whatsapp: "5541999999999" });
    const body = async (method: string) => ({ idempotencyKey: randomUUID(), fulfillmentMethod: method, reviewKey: (await review()).reviewKey, reviewedContext: context(method) });
    await t.test("GUEST and ADMIN rejected, client cannot select another user's cart or inject prices", async () => {
      for (const path of ["/checkout", "/checkout/whatsapp", "/carrinho/conferencia"]) {
        const method = path.endsWith("whatsapp") ? "POST" : "GET";
        assert.equal((await server.request(path, method)).status, 401);
        assert.equal((await server.request(path, method, undefined, admin)).status, 403);
      }
      assert.deepEqual((await review()).items, []);
      assert.equal((await req("/checkout/whatsapp", "POST", await body("PICKUP"))).status, 409);
      assert.equal((await req("/checkout/whatsapp", "POST", { ...await body("PICKUP"), price: 1, userId: user.id })).status, 400);
    });
    const product = await prisma.product.create({ data: { name: "Camiseta São João", price: 79.90, public: "unissex", category: categoryRelation,
      colors: { create: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "M", stock: 5 }, { value: "G", stock: 3 }] } },
        { colorName: "Azul Céu", colorValue: "#0000FF", images: [], variants: { create: { value: "42", stock: 3 } } }] } }, include: { colors: { include: { variants: true } } } });
    productId = product.id;
    const variant = product.colors[0].variants[0];
    for (const [variantId, quantity] of [[variant.id, 2], [product.colors[0].variants[1].id, 1], [product.colors[1].variants[0].id, 1]])
      await prisma.cartItem.create({ data: { userId: user.id, variantId, quantity } });
    await isolated.storeSettings.update({ where: { id: 1 }, data: storeDetailsData(pickupAddress, "5541999999999") });
    await prisma.userAddress.create({ data: { userId: user.id, ...address } });
    await t.test("current prices, variants, subtotals and total; DELIVERY and PICKUP messages and URL encoding", async () => {
      const current = await review();
      assert.equal(current.items.length, 3); assert.equal(current.totalCents, 31960);
      assert.equal(current.items[0].subtotalCents, 15980); assert.deepEqual(current.conflicts, []);
      const beforeCart = await prisma.cartItem.findMany({ where: { userId: user.id } });
      const beforeStock = await prisma.productVariant.findMany({ where: { color: { productId } } });
      for (const method of ["DELIVERY", "PICKUP"]) {
        const response = await req("/checkout/whatsapp", "POST", await body(method)); assert.equal(response.status, 200);
        const data = await response.json(), url = new URL(data.url);
        assert.equal(url.pathname, "/5541999999999"); assert.equal(url.searchParams.get("text"), data.message);
        assert.match(data.message, /^Olá, meu nome é João da Silva\./);
        assert.match(data.message, /Qtd: 2x Camiseta São João\.\nCor: \*Preto\*\nTamanho: \*M\*\nPreço: R\$159,80\./);
        assert.match(data.message, /Cor: \*Azul Céu\*\nTamanho: \*42\*/);
        assert.ok(data.message.includes(`Precisa de entrega? *${method === "DELIVERY" ? "Sim" : "Não"}*.`));
        assert.ok(data.message.includes("Valor Total de produtos: *R$319,60*."));
        assert.equal(data.message.includes("Endereço:"), method === "DELIVERY");
        if (method === "DELIVERY") assert.ok(data.message.includes("Rua São João, 123 · Apto 7 · Centro · Curitiba - PR · CEP 80000-000"));
        else assert.ok(!data.message.includes("Rua São João"));
      }
      assert.deepEqual(await prisma.cartItem.findMany({ where: { userId: user.id } }), beforeCart);
      assert.deepEqual(await prisma.productVariant.findMany({ where: { color: { productId } } }), beforeStock);
    });
    await t.test("persistent snapshots, idempotency, authorization and atomic concurrent confirmation", async () => {
      const input = await body("DELIVERY");
      const responses = await Promise.all(Array.from({ length: 5 }, () => req("/checkout/whatsapp", "POST", input)));
      const results = await Promise.all(responses.map(r => r.json()));
      assert.ok(responses.every(r => r.status === 200));
      assert.equal(new Set(results.map(r => r.order.id)).size, 1);
      const id = results[0].order.id;
      const saved = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
      assert.equal(saved.status, "PENDING_CONFIRMATION");
      assert.deepEqual(saved.deliveryAddress, address); assert.equal(saved.pickupAddress, null);
      assert.equal(saved.total.toString(), "319.6");
      assert.equal(saved.items[0].productName, product.name); assert.equal(saved.items[0].unitPrice.toString(), "79.9");
      assert.ok(saved.whatsappMessage.includes(`Pedido: *#${saved.number}*`));
      assert.equal((await req("/checkout/whatsapp", "POST", { ...input, fulfillmentMethod: "PICKUP" })).status, 409);
      const other = await (await req("/checkout/whatsapp", "POST", await body("PICKUP"))).json();
      const pickup = await prisma.order.findUniqueOrThrow({ where: { id: other.order.id } });
      assert.equal(pickup.sequence, saved.sequence + 1); assert.notEqual(pickup.number, saved.number);
      assert.equal(pickup.deliveryAddress, null); assert.deepEqual(pickup.pickupAddress, pickupAddress);
      assert.equal((await server.request(`/orders/${id}/confirm`, "POST")).status, 401);
      assert.equal((await req(`/orders/${id}/confirm`, "POST")).status, 403);
      await prisma.product.update({ where: { id: productId }, data: { name: "Renamed", price: 149 } });
      await prisma.userAddress.update({ where: { userId: user.id }, data: { number: "999" } });
      const historical = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
      assert.deepEqual(historical.deliveryAddress, address); assert.equal(historical.items[0].productName, product.name);
      assert.equal(historical.items[0].unitPrice.toString(), "79.9");
      await prisma.product.update({ where: { id: productId }, data: { name: product.name, price: 79.9 } });
      await prisma.userAddress.update({ where: { userId: user.id }, data: address });
      const last = product.colors[1].variants[0];
      await prisma.productVariant.update({ where: { id: last.id }, data: { stock: 0 } });
      const before = await prisma.productVariant.findMany({ where: { color: { productId } }, orderBy: { id: "asc" } });
      const failed = await server.request(`/orders/${id}/confirm`, "POST", {}, admin);
      assert.equal(failed.status, 409); assert.equal((await failed.json()).conflicts[0].available, 0);
      assert.deepEqual(await prisma.productVariant.findMany({ where: { color: { productId } }, orderBy: { id: "asc" } }), before);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id } })).status, "PENDING_CONFIRMATION");
      await prisma.productVariant.update({ where: { id: last.id }, data: { stock: 1 } });
      const confirmations = await Promise.all([id, other.order.id].map(orderId => server.request(`/orders/${orderId}/confirm`, "POST", {}, admin)));
      assert.deepEqual(confirmations.map(r => r.status).sort(), [200, 409]);
      const winner = await confirmations.find(r => r.status === 200)!.json();
      assert.equal(winner.status, "PREPARING");
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: last.id } })).stock, 0);
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, 3);
      const after = await prisma.productVariant.findMany({ where: { color: { productId } } });
      const repeated = await Promise.all([1, 2].map(() => server.request(`/orders/${winner.id}/confirm`, "POST", {}, admin)));
      assert.ok(repeated.every(r => r.status === 409));
      assert.deepEqual(await prisma.productVariant.findMany({ where: { color: { productId } } }), after);
      // Restore only test fixtures for the remaining checkout cases.
      for (const v of before) await prisma.productVariant.update({ where: { id: v.id }, data: { stock: v.id === last.id ? 3 : v.stock } });
      const peers = await Promise.all(Array.from({ length: 4 }, async () => {
        const peer = await prisma.user.create({ data: { name: "João da Silva", email: randomUUID() + "@example.test", passwordHash: "test-only" } });
        await prisma.cartItem.create({ data: { userId: peer.id, variantId: variant.id, quantity: 1 } });
        return peer;
      }));
      try {
        const numbers = await Promise.all(peers.map(async peer => {
          const { getCheckoutReview } = await import("../src/services/checkout.service.js");
          return (await prepareCheckoutWhatsapp(peer.id, { ...await body("PICKUP"), fulfillmentMethod: "PICKUP", reviewKey: (await getCheckoutReview(peer.id)).reviewKey }, isolated)).order.number;
        }));
        assert.equal(new Set(numbers).size, 4);
      } finally {
        await prisma.order.deleteMany({ where: { userId: { in: peers.map(p => p.id) } } });
        await prisma.user.deleteMany({ where: { id: { in: peers.map(p => p.id) } } });
      }
      const count = await prisma.order.count({ where: { userId: user.id } });
      const counter = await prisma.orderCounter.findUniqueOrThrow({ where: { id: 1 } });
      let boundaryOrderId: number | undefined;
      try {
        await prisma.orderCounter.update({ where: { id: 1 }, data: { value: 9999 } });
        const beyondFormerLimit = await req("/checkout/whatsapp", "POST", await body("PICKUP"));
        assert.equal(beyondFormerLimit.status, 200);
        const generated = await beyondFormerLimit.json(); boundaryOrderId = generated.order.id;
        assert.match(generated.order.number, /^\d{9,}$/);
        assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: boundaryOrderId } })).sequence, 10000);
      } finally {
        if (boundaryOrderId) await prisma.order.delete({ where: { id: boundaryOrderId } });
        await prisma.orderCounter.update({ where: { id: 1 }, data: { value: counter.value } });
      }
      assert.equal(await prisma.order.count({ where: { userId: user.id } }), count);
      const fresh = await (await req("/checkout/whatsapp", "POST", await body("PICKUP"))).json();
      const samePending = await Promise.all([1, 2].map(() => server.request(`/orders/${fresh.order.id}/confirm`, "POST", {}, admin)));
      assert.deepEqual(samePending.map(r => r.status).sort(), [200, 409]);
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, before.find(v => v.id === variant.id)!.stock - 2);
      for (const v of before) await prisma.productVariant.update({ where: { id: v.id }, data: { stock: v.id === last.id ? 3 : v.stock } });
    });
    await t.test("stock conflict and zero block WhatsApp and read-only cart keeps requested quantity", async () => {
      for (const stock of [1, 0]) {
        await prisma.productVariant.update({ where: { id: variant.id }, data: { stock } });
        const current = await review(); assert.ok(current.conflicts.some((c: any) => c.message.includes(`${stock} disponíveis`)));
        assert.equal((await (await req("/carrinho/conferencia")).json()).items[0].quantity, 2);
        assert.equal((await req("/checkout/whatsapp", "POST", await body("PICKUP"))).status, 409);
        assert.equal((await prisma.cartItem.findUniqueOrThrow({ where: { userId_variantId: { userId: user.id, variantId: variant.id } } })).quantity, 2);
      }
      await prisma.productVariant.update({ where: { id: variant.id }, data: { stock: 5 } });
    });
    await t.test("price or cart changes require a new review; unpublished products cannot finalize", async () => {
      const stale = await body("PICKUP");
      await prisma.product.update({ where: { id: productId }, data: { price: 89.9 } });
      const changed = await req("/checkout/whatsapp", "POST", stale); assert.equal(changed.status, 409);
      assert.equal((await changed.json()).review.items[0].unitPriceCents, 8990);
      await prisma.product.update({ where: { id: productId }, data: { isPublished: false } });
      assert.equal((await req("/checkout/whatsapp", "POST", await body("PICKUP"))).status, 409);
      await prisma.product.update({ where: { id: productId }, data: { isPublished: true } });
      const oldCart = await body("PICKUP");
      await prisma.cartItem.update({ where: { userId_variantId: { userId: user.id, variantId: variant.id } }, data: { quantity: 1 } });
      assert.equal((await req("/checkout/whatsapp", "POST", oldCart)).status, 409);
    });
    await t.test("missing customer/store address or WhatsApp and changed reviewed context block finalization", async () => {
      await prisma.userAddress.delete({ where: { userId: user.id } });
      assert.equal((await req("/checkout/whatsapp", "POST", await body("DELIVERY"))).status, 409);
      assert.equal((await req("/checkout/whatsapp", "POST", await body("PICKUP"))).status, 200);
      await isolated.storeSettings.update({ where: { id: 1 }, data: storeDetailsData(null, "5541999999999") });
      assert.equal((await req("/checkout/whatsapp", "POST", await body("PICKUP"))).status, 409);
      await prisma.userAddress.create({ data: { userId: user.id, ...address } });
      await isolated.storeSettings.update({ where: { id: 1 }, data: storeDetailsData(pickupAddress, null) });
      assert.equal((await req("/checkout/whatsapp", "POST", await body("DELIVERY"))).status, 409);
      await isolated.storeSettings.update({ where: { id: 1 }, data: storeDetailsData(pickupAddress, "5541999999999") });
      const stale = await body("DELIVERY");
      await prisma.userAddress.update({ where: { userId: user.id }, data: { number: "321" } });
      assert.equal((await req("/checkout/whatsapp", "POST", stale)).status, 409);
      const spoof = await body("PICKUP"); spoof.reviewedContext.customerName = "Outro Nome";
      assert.equal((await req("/checkout/whatsapp", "POST", spoof)).status, 409);

    });
    await t.test("editing one selection in review mode never silently adjusts another stock conflict", async () => {
      await prisma.productVariant.update({ where: { id: variant.id }, data: { stock: 0 } });
      const second = product.colors[0].variants[1];
      const response = await req("/carrinho?conferencia=1", "PATCH", { productId, colorId: product.colors[0].id, size: second.value, quantity: 2 });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).items.find((item: any) => item.variantId === variant.id).quantity, 1);
      assert.equal((await review()).conflicts.length, 1);
    });
    await t.test("idempotent WhatsApp recovery works when optional reporting/archive columns are not deployed", async () => {
      await prisma.productVariant.update({ where: { id: variant.id }, data: { stock: 5 } });
      const input = await body("PICKUP");
      const first = await req("/checkout/whatsapp", "POST", input);
      assert.equal(first.status, 200);
      const created = await first.json();

      // Simulate an older app database in the disposable mcd_store_test_* database.
      await prisma.$executeRaw`ALTER TABLE "Order" DROP COLUMN "completedAt", DROP COLUMN "archivedAt"`;
      try {
        await assert.rejects(
          prisma.order.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } } }),
          /completedAt|archivedAt/
        );

        const recovered = await req("/checkout/whatsapp", "POST", input);
        assert.equal(recovered.status, 200);
        const replay = await recovered.json();
        assert.equal(replay.order.id, created.order.id);
        assert.equal(replay.url, created.url);
        assert.equal(await prisma.order.count({ where: { id: created.order.id } }), 1);
      } finally {
        // Restore the shared isolated schema before other integration files use it.
        await prisma.$executeRaw`ALTER TABLE "Order" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "archivedAt" TIMESTAMP(3)`;
      }
    });
    await t.test("checkout finalization rate limit is per authenticated account", async () => {
      const limitedServer = await startTestServer(createApp({ settingsDatabase: isolated }));
      try {
        const orderCount = await prisma.order.count({ where: { userId: user.id } });
        assert.equal((await limitedServer.request("/checkout/whatsapp", "POST", {})).status, 401);
        assert.equal((await limitedServer.request("/checkout/whatsapp", "POST", {}, admin)).status, 403);
        const createdInputs = [];
        for (let attempt = 0; attempt < 20; attempt++) {
          const input = await body("PICKUP");
          createdInputs.push(input);
          assert.equal((await limitedServer.request("/checkout/whatsapp", "POST", input, token)).status, 200);
        }
        const limited = await limitedServer.request("/checkout/whatsapp", "POST", await body("PICKUP"), token);
        assert.equal(limited.status, 429);
        assert.match(limited.headers.get("ratelimit") ?? "", /^"20-in-15min";/);
        assert.equal((await limitedServer.request("/checkout/whatsapp", "POST", createdInputs[0], token)).status, 200);
        assert.equal(await prisma.order.count({ where: { userId: user.id } }), orderCount + 20);
      } finally {
        await limitedServer.close();
      }
    });
  } finally {
    await server.close(); await isolated.$disconnect();
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.order.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } }); await prisma.admin.deleteMany({ where: { email: adminEmail } });
    await db.query("SET search_path TO public"); await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.end(); await prisma.$disconnect();
  }
});
