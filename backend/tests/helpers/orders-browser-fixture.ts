import "./assert-isolated-database.js";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";
import { OrderStatus } from "../../src/generated/prisma/enums.js";
const tag = process.argv[3];
if (!/^order-browser-[a-f0-9-]{36}$/.test(tag ?? "") || !/^\/mcd_store_test_/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Temporary order fixture required.");
const email = `${tag}@example.test`;
try {
  if (process.argv[2] === "create" || process.argv[2] === "create-cancel") {
    const sequenceBase = process.argv[2] === "create-cancel" ? 6000 : 8000;
    const user = await prisma.user.create({ data: { name: "Nome Atual Diferente", email, passwordHash: "test-only" } });
    const category = await prisma.category.findFirstOrThrow();
    const product = await prisma.product.create({ data: { name: tag, price: "149", categoryId: category.id, public: "unissex", colors: { create: { colorName: "Nome Atual", colorValue: "#FFFFFF", images: [], variants: { create: [{ value: "GG", stock: 100 }, { value: "P", stock: 0 }, { value: "G", stock: 1 }] } } } }, include: { colors: { include: { variants: { orderBy: { id: "asc" } } } } } });
    const address = { cep: "80000000", street: "Rua Histórica", number: "123", complement: "Apto 7", neighborhood: "Centro", city: "Curitiba", state: "PR" };
    const pickup = { ...address, street: "Loja Histórica", number: "456", complement: "" };
    await prisma.userAddress.create({ data: { userId: user.id, ...address, street: "Rua Atual Diferente" } });
    const orders = [];
    for (let i = 0; i < 25; i++) {
      const conflict = i === 2;
      const variant = product.colors[0].variants[conflict ? 1 : 0];
      const order = await prisma.order.create({ data: {
        number: `2610${sequenceBase + i}`, sequence: sequenceBase + i, userId: user.id, customerName: `${i % 2 ? "Maria" : "João"} ${tag}`,
        status: i < 3 ? "PENDING_CONFIRMATION" : Object.values(OrderStatus)[i % 5], fulfillmentMethod: i % 2 ? "PICKUP" : "DELIVERY",
        deliveryAddress: i % 2 ? undefined : address, pickupAddress: i % 2 ? pickup : undefined,
        total: conflict ? "516.00" : "258.00", createdAt: new Date(Date.UTC(2026, 9, 25 - i, 12)), idempotencyKey: randomUUID(), requestHash: "fixture", whatsappUrl: "https://wa.me/5541999999999", whatsappMessage: "fixture",
        items: { create: [{ variantId: variant.id, originalVariantId: variant.id, productName: "Camiseta Histórica", colorName: "Branco", size: conflict ? "P" : "GG", quantity: 2, unitPrice: "129.00", subtotal: "258.00" },
          ...(conflict ? [{ variantId: product.colors[0].variants[2].id, originalVariantId: product.colors[0].variants[2].id, productName: "Segundo Item Histórico", colorName: "Branco", size: "G", quantity: 2, unitPrice: "129.00", subtotal: "258.00" }] : [])] }
      } });
      orders.push({ id: order.id, number: order.number, sequence: order.sequence });
    }
    console.log(JSON.stringify({ orders, productId: product.id, variantId: product.colors[0].variants[0].id }));
  } else if (process.argv[2] === "delete") {
    await prisma.order.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } }); await prisma.product.deleteMany({ where: { name: tag } });
  } else throw new Error("Invalid action.");
} finally { await prisma.$disconnect(); }
