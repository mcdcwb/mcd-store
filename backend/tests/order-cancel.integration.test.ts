import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser } from "../src/services/user.service.js";
import { createAdmin } from "../src/services/admin.service.js";
import { cancelOrder } from "../src/services/order.service.js";
import { stockBadge, type StockBadgeSettings } from "../src/lib/stock-badges.js";
import { startTestServer } from "./helpers/http.js";
import type { FulfillmentMethod } from "../src/generated/prisma/enums.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("administrative cancellation restores original variants atomically", async t => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mcd_store_test_/);
  const tag = randomUUID(), email = `${tag}@example.test`, adminEmail = `admin-${tag}@example.test`, password = "TestPasswordA1-" + randomUUID();
  const server = await startTestServer(createApp());
  const category = await prisma.category.create({ data: { name: tag, normalizedName: tag } });
  try {
    const user = await createUser({ name: "Cliente Histórico", email, password });
    await createAdmin({ email: adminEmail, password });
    const login = async (email: string) => (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const admin = await login(adminEmail), customer = await login(email);
    const makeProduct = () => prisma.product.create({ data: { name: tag, price: "10", categoryId: category.id, public: "unissex",
      colors: { create: [
        { colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: { create: [{ value: "P", stock: 100 }, { value: "M", stock: 100 }] } },
        { colorName: "Preto", colorValue: "#000000", images: [], variants: { create: { value: "G", stock: 100 } } }
      ] }
    }, include: { colors: { orderBy: { id: "asc" }, include: { variants: { orderBy: { id: "asc" } } } } } });
    const first = await makeProduct(), second = await makeProduct();
    const variants = [first.colors[0].variants[0], first.colors[1].variants[0], second.colors[0].variants[1]];
    const ids = variants.map(v => v.id);
    const stocks = async (variantIds = ids) => (await prisma.productVariant.findMany({ where: { id: { in: variantIds } }, orderBy: { id: "asc" } })).map(v => v.stock);
    const reset = async () => { for (const id of ids) await prisma.productVariant.update({ where: { id }, data: { stock: 100 } }); };
    let sequence = 7000;
    const makeOrder = async (fulfillmentMethod: FulfillmentMethod = "DELIVERY", variantIds = ids) => {
      sequence++;
      return prisma.order.create({ data: {
        number: `2610${sequence}`, sequence, userId: user.id, customerName: "Cliente Histórico", fulfillmentMethod,
        total: "80", idempotencyKey: randomUUID(), requestHash: "fixture", whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "Histórico",
        items: { create: [2, 3, 1, 2].map((quantity, index) => {
          const variantId = variantIds[index < 2 ? 0 : index - 1];
          return { variantId, originalVariantId: variantId, productName: `Produto Histórico ${index}`, colorName: "Cor Histórica", size: "Tamanho Histórico", quantity, unitPrice: "10", subtotal: String(quantity * 10) };
        }) }
      } });
    };
    const post = (id: number, action: string, body: unknown, token = admin) => server.request(`/orders/${id}/${action}`, "POST", body, token);
    const cancel = (id: number, expectedStatus: string) => post(id, "cancel", { expectedStatus });
    const saved = (id: number) => prisma.order.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
    const immutable = async (id: number) => { const { status, updatedAt, ...data } = await saved(id); return data; };
    await prisma.cartItem.create({ data: { userId: user.id, variantId: ids[0], quantity: 1 } });
    await prisma.favorite.create({ data: { userId: user.id, productId: first.id } });
    const cart = await prisma.cartItem.findMany({ where: { userId: user.id } });
    const favorites = await prisma.favorite.findMany({ where: { userId: user.id } });

    await t.test("public stock badges follow confirmation and cancellation without modifying the manual badge", async () => {
      const product = await makeProduct();
      await prisma.product.update({ where: { id: product.id }, data: { badge: "NOVO" } });
      await prisma.productVariant.updateMany({ where: { color: { productId: product.id } }, data: { stock: 0 } });
      const variantId = product.colors[1].variants[0].id;
      await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 2 } });
      sequence++;
      const order = await prisma.order.create({ data: { number: `2610${sequence}`, sequence, userId: user.id, customerName: "Badge Test", fulfillmentMethod: "PICKUP",
        total: "10", idempotencyKey: randomUUID(), requestHash: "fixture", whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "Histórico",
        items: { create: { variantId, originalVariantId: variantId, productName: product.name, colorName: "Preto", size: "G", quantity: 1, unitPrice: "10", subtotal: "10" } }
      } });
      const settings: StockBadgeSettings = await (await server.request("/settings/public")).json();
      const badge = async () => {
        const catalog = await (await server.request("/produtos")).json();
        const current = catalog.find((item: { id: number }) => item.id === product.id);
        assert.equal(current.badge, "NOVO");
        return stockBadge(current, settings);
      };
      assert.equal(await badge(), "low-stock");
      assert.equal((await post(order.id, "confirm", {})).status, 200);
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 1);
      assert.equal(await badge(), "last-unit");
      assert.equal((await cancel(order.id, "PREPARING")).status, 200);
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 2);
      assert.equal(await badge(), "low-stock");
    });

    await t.test("ADMIN-only, strict contract, missing order and stale expected state", async () => {
      const order = await makeOrder();
      assert.equal((await server.request(`/orders/${order.id}/cancel`, "POST", { expectedStatus: "PENDING_CONFIRMATION" })).status, 401);
      assert.equal((await post(order.id, "cancel", { expectedStatus: "PENDING_CONFIRMATION" }, customer)).status, 403);
      assert.equal((await cancel(2147483647, "PREPARING")).status, 404);
      assert.equal((await server.request("/orders/invalid/cancel", "POST", { expectedStatus: "PREPARING" }, admin)).status, 400);
      for (const body of [{}, { expectedStatus: "COMPLETED" }, { expectedStatus: "CANCELLED" }, { expectedStatus: "PAID" }, { expectedStatus: ["PREPARING"] }, { expectedStatus: "PENDING_CONFIRMATION", status: "PREPARING" }, { expectedStatus: "PREPARING", userId: user.id }])
        assert.equal((await post(order.id, "cancel", body)).status, 400);
      for (const status of ["PREPARING", "READY_OR_SHIPPED"]) assert.equal((await cancel(order.id, status)).status, 409);
      await assert.rejects(cancelOrder(order.id, "COMPLETED" as never), error => error instanceof Error && /não permite/.test(error.message));
      assert.equal((await saved(order.id)).status, "PENDING_CONFIRMATION"); assert.deepEqual(await stocks(), [100, 100, 100]);
    });

    for (const fulfillmentMethod of ["DELIVERY", "PICKUP"] as const) for (const status of ["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED"] as const)
      await t.test(`${status} ${fulfillmentMethod}: exact increments, repeated items, concurrent cancel and terminal state`, async () => {
        await reset(); const order = await makeOrder(fulfillmentMethod); const before = await immutable(order.id);
        if (status !== "PENDING_CONFIRMATION") {
          assert.equal((await post(order.id, "confirm", {})).status, 200);
          assert.deepEqual(await stocks(), [95, 99, 98]);
          assert.equal((await post(order.id, "confirm", {})).status, 409);
          if (status === "READY_OR_SHIPPED") {
            assert.equal((await post(order.id, "advance", { expectedStatus: "PREPARING" })).status, 200);
            assert.deepEqual(await stocks(), [95, 99, 98]);
          }
          // Preserve identity despite edits; increment over a later restock.
          await prisma.product.update({ where: { id: first.id }, data: { name: "Nome Atual", price: "200" } });
          await prisma.productColor.update({ where: { id: first.colors[0].id }, data: { colorName: "Cor Atual" } });
          await prisma.productVariant.update({ where: { id: ids[0] }, data: { value: "Novo Tamanho", stock: { increment: 5 } } });
        }
        const responses = await Promise.all([1, 2].map(() => cancel(order.id, status)));
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
        assert.equal((await responses.find(r => r.status === 200)!.json()).status, "CANCELLED");
        assert.match((await responses.find(r => r.status === 409)!.json()).error, /status.*mudou/);
        assert.deepEqual(await stocks(), status === "PENDING_CONFIRMATION" ? [100, 100, 100] : [105, 100, 100]);
        assert.deepEqual(await immutable(order.id), before);
        assert.equal((await cancel(order.id, status)).status, 409);
        assert.equal((await post(order.id, "confirm", {})).status, 409);
        for (const expectedStatus of ["PREPARING", "READY_OR_SHIPPED"])
          assert.equal((await post(order.id, "advance", { expectedStatus })).status, 409);
        assert.deepEqual(await stocks(), status === "PENDING_CONFIRMATION" ? [100, 100, 100] : [105, 100, 100]);
        assert.deepEqual(await prisma.cartItem.findMany({ where: { userId: user.id } }), cart);
        assert.deepEqual(await prisma.favorite.findMany({ where: { userId: user.id } }), favorites);
      });

    await t.test("COMPLETED cannot cancel or reopen and advance never restores stock", async () => {
      await reset(); const order = await makeOrder();
      assert.equal((await post(order.id, "confirm", {})).status, 200);
      for (const expectedStatus of ["PREPARING", "READY_OR_SHIPPED"])
        assert.equal((await post(order.id, "advance", { expectedStatus })).status, 200);
      for (const expectedStatus of ["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED"])
        assert.equal((await cancel(order.id, expectedStatus)).status, 409);
      assert.equal((await cancel(order.id, "COMPLETED")).status, 400);
      assert.equal((await saved(order.id)).status, "COMPLETED"); assert.deepEqual(await stocks(), [95, 99, 98]);
    });

    await t.test("second variant restoration failure rolls back the first increment and status", async () => {
      await reset(); const order = await makeOrder();
      assert.equal((await post(order.id, "confirm", {})).status, 200);
      await prisma.productVariant.update({ where: { id: ids[1] }, data: { stock: 2147483647 } });
      const before = await saved(order.id);
      const response = await cancel(order.id, "PREPARING");
      assert.equal(response.status, 409); assert.match((await response.json()).error, /limite de estoque/);
      assert.deepEqual(await stocks(), [95, 2147483647, 98]); assert.deepEqual(await saved(order.id), before);
      await prisma.productVariant.update({ where: { id: ids[1] }, data: { stock: 99 } });
      assert.equal((await cancel(order.id, "PREPARING")).status, 200); assert.deepEqual(await stocks(), [100, 100, 100]);
    });

    for (const removal of ["variant", "product"] as const) await t.test(`removed ${removal}: confirmed cancellation fails wholly; pending cancellation needs no variant`, async () => {
      const product = await makeProduct(); const variantIds = product.colors.flatMap(c => c.variants).slice(0, 3).map(v => v.id);
      const order = await makeOrder("PICKUP", variantIds), pending = await makeOrder("DELIVERY", variantIds);
      assert.equal((await post(order.id, "confirm", {})).status, 200);
      if (removal === "variant") await prisma.productVariant.delete({ where: { id: variantIds[1] } });
      else await prisma.product.delete({ where: { id: product.id } });
      const before = await saved(order.id), beforeStocks = await stocks(variantIds);
      assert.ok(before.items.some(i => i.variantId === null));
      const response = await cancel(order.id, "PREPARING");
      assert.equal(response.status, 409); assert.match((await response.json()).error, /variante original/);
      assert.deepEqual(await saved(order.id), before); assert.deepEqual(await stocks(variantIds), beforeStocks);
      assert.equal((await cancel(pending.id, "PENDING_CONFIRMATION")).status, 200);
      assert.deepEqual(await stocks(variantIds), beforeStocks);
    });

    await t.test("cancel versus confirmation or advance serializes without mismatched stock", async () => {
      for (const action of ["confirm", "advance"] as const) {
        await reset(); const order = await makeOrder();
        if (action === "advance") assert.equal((await post(order.id, "confirm", {})).status, 200);
        const status = action === "confirm" ? "PENDING_CONFIRMATION" : "PREPARING";
        const responses = await Promise.all([cancel(order.id, status), post(order.id, action, action === "confirm" ? {} : { expectedStatus: status })]);
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
        const current = await saved(order.id);
        assert.ok(["CANCELLED", action === "confirm" ? "PREPARING" : "READY_OR_SHIPPED"].includes(current.status));
        assert.deepEqual(await stocks(), current.status === "CANCELLED" ? [100, 100, 100] : [95, 99, 98]);
      }
    });
  } finally {
    await server.close(); await prisma.order.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } }); await prisma.admin.deleteMany({ where: { email: adminEmail } });
    await prisma.product.deleteMany({ where: { categoryId: category.id } }); await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  }
});
