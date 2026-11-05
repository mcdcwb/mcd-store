import { orderNumber } from "../lib/order-number.js";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { cartForReview } from "./shopping.service.js";
import { publicStoreDetails, storeDetailsSelect } from "./settings.service.js";
import { addressSchema } from "../schemas/account.schema.js";
import type { checkoutSchema } from "../schemas/checkout.schema.js";
import { checkoutMessage } from "../lib/checkout-message.js";
import { whatsappUrl } from "../lib/store-contact.js";

export class CheckoutError extends Error {
  constructor(public status: number, message: string, public review?: Awaited<ReturnType<typeof getCheckoutReview>>) { super(message); }
}
async function review(userId: number, tx: Prisma.TransactionClient) {
  const cart = await cartForReview(userId, tx);
  const conflicts: { variantId: number; message: string }[] = [];
  let totalCents = 0;
  const items = cart.items.map(item => {
    const color = item.product.colors.find(color => color.id === item.colorId)!;
    const variant = color.variants.find(variant => variant.id === item.variantId)!;
    const label = `${item.product.name}, cor ${color.colorName}, tamanho ${item.size}`;
    const price = new Prisma.Decimal(item.product.price).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const subtotalCents = price * item.quantity;
    if (!item.product.isPublished) conflicts.push({ variantId: item.variantId, message: `${label}: produto indisponível para compra.` });
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) conflicts.push({ variantId: item.variantId, message: `${label}: quantidade inválida.` });
    if (item.quantity > variant.stock) conflicts.push({
      variantId: item.variantId,
      message: `${label}: o estoque mudou. Você selecionou ${item.quantity} unidades, mas agora existem apenas ${variant.stock} disponíveis.`
    });
    if (!Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(subtotalCents) || subtotalCents < 1)
      throw new CheckoutError(409, "Um produto possui preço inválido. Entre em contato com a loja.");
    totalCents += subtotalCents;
    return { ...item, unitPriceCents: price, subtotalCents };
  });
  if (!Number.isSafeInteger(totalCents)) throw new CheckoutError(409, "O valor dos produtos não pôde ser calculado.");
  const reviewKey = createHash("sha256").update(JSON.stringify(items.map(item => [item.variantId, item.product.name,
  item.product.colors.find(color => color.id === item.colorId)?.colorName, item.size, item.quantity, item.unitPriceCents, item.product.isPublished]))).digest("hex");
  return { items, totalCents, reviewKey, conflicts };
}
export const getCheckoutReview = (userId: number) => prisma.$transaction(tx => review(userId, tx), {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
});


export async function prepareCheckoutWhatsapp(userId: number, input: z.infer<typeof checkoutSchema>, storeDatabase: Pick<typeof prisma, "storeSettings"> = prisma) {
  // Não permite criar pedidos nem recuperar links antigos no modo demonstrativo.
  if (process.env.DEMO_MODE === "true") {
    throw new CheckoutError(
      403,
      "O checkout está desativado nesta demonstração."
    );
  }

  // Serialize attempts for this user; retries see committed orders under ReadCommitted.
  return prisma.$transaction(async tx => {

    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const requestHash = createHash("sha256").update(JSON.stringify([input.fulfillmentMethod, input.reviewKey,
    input.reviewedContext.customerName, input.reviewedContext.whatsapp,
    input.reviewedContext.address && addressSchema.parse(input.reviewedContext.address),
    input.reviewedContext.pickupAddress && addressSchema.parse(input.reviewedContext.pickupAddress)])).digest("hex");
    // Checkout recovery only needs these persisted values. Keep this query independent
    // of newer optional Order columns so checkout retries remain available while an
    // additive reporting/archive migration is being rolled out.
    const previous = await tx.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      select: { id: true, number: true, status: true, requestHash: true, whatsappUrl: true, whatsappMessage: true }
    });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new CheckoutError(409, "Esta tentativa já foi utilizada com outros dados.");
      return { order: { id: previous.id, number: previous.number, status: previous.status }, url: previous.whatsappUrl, message: previous.whatsappMessage };
    }
    const current = await review(userId, tx);
    if (!current.items.length) throw new CheckoutError(409, "Seu carrinho está vazio.", current);
    if (current.conflicts.length) throw new CheckoutError(409, "Revise os itens com disponibilidade alterada.", current);
    if (current.reviewKey !== input.reviewKey) throw new CheckoutError(409, "Os itens ou preços mudaram. Confira os valores atualizados antes de finalizar.", current);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId }, select: {
        name: true, phone: true, active: true,
        address: { select: { cep: true, street: true, number: true, complement: true, neighborhood: true, city: true, state: true } }
      }
    });
    if (!user.active) throw new CheckoutError(403, "Conta inativa.");
    const store = publicStoreDetails(await (storeDatabase === prisma ? tx : storeDatabase).storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: storeDetailsSelect }));
    const parsedAddress = addressSchema.safeParse(user.address);
    const address = parsedAddress.success ? parsedAddress.data : null;
    const parsedPickup = addressSchema.safeParse(store.address);
    const pickupAddress = parsedPickup.success ? parsedPickup.data : null;
    if (input.fulfillmentMethod === "DELIVERY" && !address) throw new CheckoutError(409, "Cadastre um endereço válido em Minha Conta para receber seu pedido.");
    if (input.fulfillmentMethod === "PICKUP" && !pickupAddress) throw new CheckoutError(409, "O local de retirada está temporariamente indisponível.");
    const baseUrl = whatsappUrl(store.whatsapp);
    if (!baseUrl) throw new CheckoutError(409, "O contato da loja está indisponível nesta demonstração.");
    const context = {
      customerName: user.name, address: input.fulfillmentMethod === "DELIVERY" ? address : null,
      pickupAddress: input.fulfillmentMethod === "PICKUP" ? pickupAddress : null, whatsapp: store.whatsapp
    };
    // Compare fields explicitly: JSON key ordering is not part of the contract.
    const sameAddress = (a: typeof address, b: typeof address) => a === null || b === null ? a === b
      : Object.keys(a).every(key => a[key as keyof typeof a] === b[key as keyof typeof b]);
    if (context.customerName !== input.reviewedContext.customerName || context.whatsapp !== input.reviewedContext.whatsapp ||
      !sameAddress(context.address, input.reviewedContext.address) || !sameAddress(context.pickupAddress, input.reviewedContext.pickupAddress))
      throw new CheckoutError(409, "Os dados de endereço ou contato mudaram. Confira os dados atualizados antes de finalizar.");
    const counters = await tx.$queryRaw<{ value: number }[]>`UPDATE "OrderCounter" SET value = value + 1 WHERE id = 1 AND value < 2147483647 RETURNING value`;
    if (!counters.length) throw new CheckoutError(409, "Limite de numeração de pedidos atingido. Entre em contato com a loja.");
    const [{ createdAt }] = await tx.$queryRaw<{ createdAt: Date }[]>`SELECT clock_timestamp() AS "createdAt"`;
    const number = orderNumber(counters[0].value, createdAt);
    const message = checkoutMessage(user.name, current.items.map(item => ({
      name: item.product.name,
      color: item.product.colors.find(color => color.id === item.colorId)!.colorName, size: item.size,
      quantity: item.quantity, subtotalCents: item.subtotalCents
    })), input.fulfillmentMethod, context.address, current.totalCents, number);
    const url = whatsappUrl(store.whatsapp, message)!;
    const money = (cents: number) => new Prisma.Decimal(cents).div(100);
    const order = await tx.order.create({
      data: {
        number, sequence: counters[0].value, userId, fulfillmentMethod: input.fulfillmentMethod,
        customerName: user.name, customerPhone: user.phone, deliveryAddress: context.address ?? Prisma.DbNull,
        pickupAddress: context.pickupAddress ?? Prisma.DbNull, total: money(current.totalCents),
        idempotencyKey: input.idempotencyKey, requestHash, whatsappUrl: url, whatsappMessage: message, createdAt,
        statusEvents: { create: { status: "PENDING_CONFIRMATION", createdAt } },
        items: {
          create: current.items.map(item => ({
            variantId: item.variantId, originalVariantId: item.variantId,
            productName: item.product.name, colorName: item.product.colors.find(color => color.id === item.colorId)!.colorName,
            size: item.size, quantity: item.quantity, unitPrice: money(item.unitPriceCents), subtotal: money(item.subtotalCents)
          }))
        }
      }, select: { id: true, number: true, status: true }
    });
    return { order, url, message };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
