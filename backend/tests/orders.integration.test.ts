import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { OrderStatus } from "../src/generated/prisma/enums.js";
import { createApp } from "../src/app.js";
import { createUser } from "../src/services/user.service.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
test("ADMIN order reads validate filters, pagination and historical snapshots", async t => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mcd_store_test_/);
  const tag = randomUUID(), password = "TestPasswordA1-" + randomUUID(), email = `${tag}@example.test`, adminEmail = `admin-${tag}@example.test`, otherEmail = `other-${tag}@example.test`;
  const address = { cep: "80000000", street: "Rua Histórica", number: "123", complement: "", neighborhood: "Centro", city: "Curitiba", state: "PR" };
  const storeAddress = { ...address, street: "Loja Histórica", number: "456" };
  const server = await startTestServer(createApp());
  try {
    const user = await createUser({ name: "Nome Atual", email, password });
    await createAdmin({ email: adminEmail, password });
    const login = async (email: string) => (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken;
    const admin = await login(adminEmail), customer = await login(email);
    const statuses = Object.values(OrderStatus);
    const orders = [];
    for (let i = 0; i < 25; i++) orders.push(await prisma.order.create({ data: {
      number: `2611${String(9000 + i).padStart(4, "0")}`, sequence: 9000 + i, userId: user.id,
      customerName: `${i % 2 ? "Maria" : "João"} ${tag}`, status: statuses[i % statuses.length],
      fulfillmentMethod: i % 2 ? "PICKUP" : "DELIVERY", deliveryAddress: i % 2 ? undefined : address,
      pickupAddress: i % 2 ? storeAddress : undefined, total: "258.00", idempotencyKey: randomUUID(), requestHash: "fixture",
      whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "fixture", createdAt: new Date(Date.UTC(2026, 9, 25 - i, 12)),
      items: { create: { originalVariantId: 42, productName: "Produto Histórico", colorName: "Branco", size: "GG", quantity: 2, unitPrice: "129.00", subtotal: "258.00" } }
    } }));
    await prisma.userAddress.create({ data: { userId: user.id, ...address, street: "Rua Atual" } });
    const read = async (query = "") => server.request(`/orders?search=${tag}${query}`, "GET", undefined, admin);
    await t.test("GUEST 401 and USER 403 for both list and details; ADMIN reads", async () => {
      for (const path of ["/orders", `/orders/${orders[0].id}`]) {
        assert.equal((await server.request(path)).status, 401);
        assert.equal((await server.request(path, "GET", undefined, customer)).status, 403);
        assert.equal((await server.request(path, "GET", undefined, admin)).status, 200);
      }
    });
    await t.test("default recent-first, all sort directions, and stable pagination", async () => {
      const first = await (await read()).json();
      assert.equal(first.items.length, 20); assert.equal(first.total, 25); assert.equal(first.totalPages, 2);
      assert.equal(first.items[0].id, orders[0].id);
      assert.ok(!("deliveryAddress" in first.items[0])); assert.ok(!("requestHash" in first.items[0]));
      const second = await (await read("&page=2")).json(); assert.equal(second.items.length, 5);
      assert.equal(new Set([...first.items, ...second.items].map(o => o.id)).size, 25);
      const clamped = await (await read("&page=999")).json(); assert.equal(clamped.page, 2);
      for (const sort of ["date", "number"]) for (const direction of ["asc", "desc"]) {
        const data = await (await read(`&sort=${sort}&direction=${direction}&pageSize=50`)).json();
        const expected = [...orders].sort((a, b) => (sort === "number" ? a.sequence - b.sequence : a.createdAt.getTime() - b.createdAt.getTime()) * (direction === "asc" ? 1 : -1));
        assert.deepEqual(data.items.map(o => o.id), expected.map(o => o.id));
      }
    });
    await t.test("archive is ADMIN-only, hides operationally, and preserves history, status and stock", async () => {
      const order = await prisma.order.create({ data: { number: "26119999", sequence: 9999, userId: user.id, customerName: `Arquivar ${tag}`, status: "PENDING_CONFIRMATION", fulfillmentMethod: "PICKUP", total: "1.00", idempotencyKey: randomUUID(), requestHash: "archive", whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "fixture", items: { create: { originalVariantId: 42, productName: "Arquivo histórico", colorName: "Preto", size: "P", quantity: 1, unitPrice: "1.00", subtotal: "1.00" } } } });
      assert.equal((await server.request(`/orders/${order.id}/archive`, "POST", {}, customer)).status, 403);
      assert.equal((await server.request(`/orders/${order.id}/archive`, "POST", {})).status, 401);
      const archived = await server.request(`/orders/${order.id}/archive`, "POST", {}, admin);
      assert.equal(archived.status, 200);
      const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      assert.ok(saved.archivedAt); assert.equal(saved.status, order.status); assert.equal(saved.items.length, 1);
      const list = await (await read("&pageSize=50")).json(); assert.equal(list.items.some((item: any) => item.id === order.id), false);
      assert.equal((await server.request(`/orders/${order.id}/archive`, "POST", {}, admin)).status, 409);
    });
    await t.test("reports rank only completed sales in the six-month window and retain archived orders without stock or status changes", async () => {
      const category = await prisma.category.upsert({ where: { normalizedName: tag.toLowerCase() }, update: {}, create: { name: tag, normalizedName: tag.toLowerCase() } });
      const product = await prisma.product.create({ data: { name: tag, price: "10.00", public: "unissex", categoryId: category.id,
        colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: { value: "P", stock: 7 } } } },
      }, include: { colors: { include: { variants: true } } } });
      const variant = product.colors[0].variants[0];
      const completedAt = new Date();
      const makeReportOrder = (sequence: number, productName: string, quantity: number, total: string, date: Date, variantId: number | null = null) => {
        const unitPrice = (Number(total) / quantity).toFixed(2);
        return prisma.order.create({ data: {
          number: `2611${String(sequence).padStart(4, "0")}`, sequence, userId: user.id, customerName: "Pedido de relatório", status: "COMPLETED", fulfillmentMethod: "PICKUP",
          total, completedAt: date, idempotencyKey: randomUUID(), requestHash: "report-fixture", whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "fixture",
          items: { create: { variantId, originalVariantId: variantId ?? 42, productName, colorName: "Preto", size: "P", quantity, unitPrice, subtotal: total } }
        } });
      };
      const archivedName = `Relatório ${tag}-A`, tieName = `Relatório ${tag}-B`, topName = `Relatório ${tag}-C`, oldName = `Relatório ${tag}-fora-do-período`;
      const archived = await makeReportOrder(1200, archivedName, 3, "30.00", completedAt, variant.id);
      await makeReportOrder(1201, tieName, 3, "30.00", completedAt);
      await makeReportOrder(1202, topName, 5, "50.00", completedAt);
      await makeReportOrder(1203, oldName, 9, "90.00", new Date(completedAt.getTime() - 300 * 24 * 60 * 60 * 1000));

      const response = await server.request(`/orders/${archived.id}/archive`, "POST", {}, admin);
      assert.equal(response.status, 200);
      const saved = await prisma.order.findUniqueOrThrow({ where: { id: archived.id }, include: { items: true } });
      assert.ok(saved.archivedAt); assert.equal(saved.status, "COMPLETED"); assert.equal(saved.items.length, 1);
      assert.equal(saved.items[0].productName, archivedName); assert.equal(saved.items[0].quantity, 3);
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, 7);

      const reportResponse = await server.request("/orders/reports", "GET", undefined, admin);
      assert.equal(reportResponse.status, 200);
      const report = await reportResponse.json();
      assert.deepEqual(report.topProducts.slice(0, 3), [
        { productName: topName, quantity: 5 }, { productName: archivedName, quantity: 3 }, { productName: tieName, quantity: 3 }
      ]);
      assert.deepEqual(report.lowestProducts.slice(0, 3), [
        { productName: archivedName, quantity: 3 }, { productName: tieName, quantity: 3 }, { productName: topName, quantity: 5 }
      ]);
      assert.ok(!report.topProducts.some((item: { productName: string }) => [oldName, "Produto Histórico"].includes(item.productName)));
      assert.ok(!report.lowestProducts.some((item: { productName: string }) => [oldName, "Produto Histórico"].includes(item.productName)));
      assert.equal(report.monthly.length, 6);
      assert.deepEqual(report.monthly.map((item: { revenue: string }) => item.revenue).sort(), ["0.00", "0.00", "0.00", "0.00", "0.00", "110.00"]);
    });
    await t.test("number/name search, every status and combined criteria", async () => {
      const byNumber = await (await server.request(`/orders?search=%23${orders[0].number}`, "GET", undefined, admin)).json();
      assert.deepEqual(byNumber.items.map(o => o.id), [orders[0].id]);
      const byName = await (await server.request(`/orders?search=${encodeURIComponent(`mArIa ${tag}`)}&pageSize=50`, "GET", undefined, admin)).json();
      assert.equal(byName.total, 12);
      for (const status of statuses) {
        const filtered = await (await read(`&status=${status}`)).json();
        assert.equal(filtered.total, 5); assert.ok(filtered.items.every(o => o.status === status));
      }
      const combined = await (await server.request(`/orders?search=${encodeURIComponent(`maria ${tag}`)}&status=PREPARING&sort=number&direction=desc&pageSize=1&page=2`, "GET", undefined, admin)).json();
      assert.equal(combined.total, 3); assert.equal(combined.items.length, 1); assert.equal(combined.page, 2);
      assert.equal(combined.items[0].sequence, 9011);
      const empty = await (await server.request("/orders?status=CANCELLED&search=nonexistent-order-name", "GET", undefined, admin)).json();
      assert.deepEqual(empty.items, []); assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.equal(empty.totalPages, 1);
    });
    await t.test("invalid parameters and IDs are rejected", async () => {
      for (const query of ["sort=price", "direction=sideways", "status=PAID", "page=0", "page=1.5", "page=1000001", "pageSize=51", "pageSize=0", "foo=bar", "sort=date&sort=number", "search=a&search=b", "search=" + "a".repeat(101)])
        assert.equal((await server.request(`/orders?${query}`, "GET", undefined, admin)).status, 400, query);
      assert.equal((await server.request("/orders/invalid", "GET", undefined, admin)).status, 400);
      assert.equal((await server.request("/orders/2147483647", "GET", undefined, admin)).status, 404);
    });
    await t.test("advance is ADMIN-only, sequential, atomic and never changes stock", async () => {
      const category = await prisma.category.findFirstOrThrow();
      const product = await prisma.product.create({ data: { name: tag, price: "129", categoryId: category.id, public: "unissex",
        colors: { create: { colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: { create: { value: "GG", stock: 0 } } } }
      }, include: { colors: { include: { variants: true } } } });
      const variant = product.colors[0].variants[0];
      await prisma.orderItem.updateMany({ where: { orderId: { in: orders.map(o => o.id) } }, data: { variantId: variant.id, originalVariantId: variant.id } });
      const advance = (id: number, body: unknown, token = admin) => server.request(`/orders/${id}/advance`, "POST", body, token);
      const preparing = orders.find(o => o.status === "PREPARING")!;
      assert.equal((await server.request(`/orders/${preparing.id}/advance`, "POST", { expectedStatus: "PREPARING" })).status, 401);
      assert.equal((await advance(preparing.id, { expectedStatus: "PREPARING" }, customer)).status, 403);
      assert.equal((await advance(2147483647, { expectedStatus: "PREPARING" })).status, 404);
      assert.equal((await advance(preparing.id, {})).status, 400);
      for (const status of ["PENDING_CONFIRMATION", "PREPARING", "COMPLETED", "CANCELLED"]) {
        const order = orders.find(o => o.status === status)!;
        for (const expectedStatus of ["PREPARING", "READY_OR_SHIPPED"]) {
          if (status === expectedStatus) continue;
          assert.equal((await advance(order.id, { expectedStatus })).status, 409);
        }
        for (const target of ["PREPARING", "READY_OR_SHIPPED", "COMPLETED", "CANCELLED"])
          assert.equal((await advance(order.id, { expectedStatus: status, status: target })).status, 400);
        if (["PENDING_CONFIRMATION", "COMPLETED", "CANCELLED"].includes(status))
          assert.equal((await advance(order.id, { expectedStatus: status })).status, 400);
      }
      for (const fulfillmentMethod of ["DELIVERY", "PICKUP"]) {
        const order = orders.find(o => o.status === "PREPARING" && o.fulfillmentMethod === fulfillmentMethod)!;
        const responses = await Promise.all([1, 2].map(() => advance(order.id, { expectedStatus: "PREPARING" })));
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
        assert.match((await responses.find(r => r.status === 409)!.json()).error, /status.*mudou/);
        assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "READY_OR_SHIPPED");
        assert.equal((await advance(order.id, { expectedStatus: "PREPARING" })).status, 409);
        const completed = await advance(order.id, { expectedStatus: "READY_OR_SHIPPED" });
        assert.equal(completed.status, 200); assert.equal((await completed.json()).status, "COMPLETED");
        assert.equal((await advance(order.id, { expectedStatus: "READY_OR_SHIPPED" })).status, 409);
        assert.equal((await server.request(`/orders/${order.id}/confirm`, "POST", {}, admin)).status, 409);
      }
      assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, 0);
    });
    await t.test("details use snapshots only and omit internal checkout/security fields", async () => {
      for (const index of [0, 1]) {
        const detail = await (await server.request(`/orders/${orders[index].id}`, "GET", undefined, admin)).json();
        assert.equal(detail.customerName, orders[index].customerName); assert.equal(detail.total, "258");
        assert.deepEqual(detail.deliveryAddress, index === 0 ? address : null);
        assert.deepEqual(detail.pickupAddress, index === 1 ? storeAddress : null);
        assert.equal(detail.items[0].productName, "Produto Histórico"); assert.equal(detail.items[0].unitPrice, "129");
        for (const field of ["requestHash", "idempotencyKey", "whatsappUrl", "whatsappMessage", "user", "userId"]) assert.ok(!(field in detail));
      }
    });
    await t.test("customer order list is scoped to the authenticated USER", async () => {
      const other = await createUser({ name: "Outro cliente", email: otherEmail, password });
      const foreignOrder = await prisma.order.create({ data: {
        number: "26119998", sequence: 9998, userId: other.id, customerName: "Outro cliente", status: "PENDING_CONFIRMATION",
        fulfillmentMethod: "PICKUP", total: "1.00", idempotencyKey: randomUUID(), requestHash: "foreign",
        whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "fixture"
      } });
      const mine = await server.request("/orders/mine", "GET", undefined, customer);
      assert.equal(mine.status, 200);
      const result = await mine.json();
      const ownOrders = await prisma.order.findMany({ where: { userId: user.id }, select: { id: true } });
      assert.deepEqual(result.items.map((order: { id: number }) => order.id).sort((a: number, b: number) => a - b), ownOrders.map(order => order.id).sort((a, b) => a - b));
      assert.ok(!result.items.some((order: { id: number }) => order.id === foreignOrder.id));
      assert.equal((await server.request("/orders/mine", "GET", undefined, admin)).status, 403);
      assert.equal((await server.request("/orders/mine")).status, 401);
    });
  } finally {
    await server.close(); await prisma.order.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.product.deleteMany({ where: { name: tag } });
    await prisma.category.deleteMany({ where: { normalizedName: tag.toLowerCase() } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } }); await prisma.admin.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  }
});
