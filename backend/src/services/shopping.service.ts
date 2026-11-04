import { prisma } from "../lib/prisma.js";
import { productInclude } from "./product.service.js";
import { Prisma } from "../generated/prisma/client.js";

export class ShoppingError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
type FavoriteOwner = { id: number; role: "USER" | "ADMIN" };
export const favorites = (owner: FavoriteOwner) => owner.role === "ADMIN"
    ? prisma.adminFavorite.findMany({ where: { adminId: owner.id, product: { isPublished: true } }, include: { product: { include: productInclude } }, orderBy: { productId: "asc" } })
    : prisma.favorite.findMany({ where: { userId: owner.id, product: { isPublished: true } }, include: { product: { include: productInclude } }, orderBy: { productId: "asc" } });
export async function favorite(owner: FavoriteOwner, productId: number, remove = false) {
    if (!remove && !await prisma.product.findFirst({ where: { id: productId, isPublished: true } })) throw new ShoppingError(404, "Produto não encontrado.");
    if (owner.role === "ADMIN") {
        if (remove) await prisma.adminFavorite.deleteMany({ where: { adminId: owner.id, productId } });
        else await prisma.adminFavorite.upsert({ where: { adminId_productId: { adminId: owner.id, productId } }, create: { adminId: owner.id, productId }, update: {} });
    } else {
        if (remove) await prisma.favorite.deleteMany({ where: { userId: owner.id, productId } });
        else await prisma.favorite.upsert({ where: { userId_productId: { userId: owner.id, productId } }, create: { userId: owner.id, productId }, update: {} });
    }
    return favorites(owner);
}

type Selection = { productId: number; colorId?: number; size: string; quantity: number };
// Checkout reads must preserve requested quantities, including unavailable selections.
export async function cartForReview(userId: number, database: Prisma.TransactionClient = prisma) {
    const rows = await database.cartItem.findMany({ where: { userId },
        include: { variant: { include: { color: { include: { product: { include: productInclude } } } } } }, orderBy: { variantId: "asc" } });
    return { items: rows.map(row => ({ product: row.variant.color.product, colorId: row.variant.colorId,
        variantId: row.variantId, size: row.variant.value, quantity: row.quantity })), notices: [] as string[] };
}
// Serializable transactions also protect against concurrent stock edits and cart writes.
export async function cart(userId: number, action: "read" | "add" | "set" | "remove" | "clear" | "merge", selections: Selection[] = [], reconcile = true) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(async tx => {
                // Serialize this account's cart operations, including repeated merge requests.
                await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
                const notices: string[] = [];
                if (action === "clear") await tx.cartItem.deleteMany({ where: { userId } });
                for (const item of selections) {
                    // Legacy guest carts without colorId belong to the original (first) color.
                    const colorId = item.colorId ?? (await tx.productColor.findFirst({ where: { productId: item.productId }, orderBy: [{ position: "asc" }, { id: "asc" }] }))?.id;
                    const variant = colorId === undefined ? null : await tx.productVariant.findFirst({ where: { colorId, value: item.size, color: { productId: item.productId } }, include: { color: { select: { product: { select: { isPublished: true } } } } } });
                    if (!variant) {
                        if (action === "merge") { notices.push(`Produto ${item.productId}, tamanho ${item.size}: indisponível.`); continue; }
                        throw new ShoppingError(404, "Variante não encontrada.");
                    }
                    if (!variant.color.product.isPublished && action !== "remove") {
                        if (action === "merge") { notices.push(`Produto ${item.productId}, tamanho ${item.size}: indisponível para compra.`); continue; }
                        throw new ShoppingError(409, "Produto indisponível para compra.");
                    }
                    const where = { userId_variantId: { userId, variantId: variant.id } };
                    const previous = await tx.cartItem.findUnique({ where });
                    let quantity = action === "remove" ? 0 : action === "add" ? (previous?.quantity ?? 0) + item.quantity : item.quantity;
                    if (action === "merge") {
                        quantity = Math.min(variant.stock, Math.max(previous?.quantity ?? 0, item.quantity));
                        if (quantity < item.quantity) notices.push(`Produto ${item.productId}, tamanho ${item.size}: quantidade ajustada ao estoque (${quantity}).`);
                    } else if (quantity > variant.stock) throw new ShoppingError(409, "Quantidade superior ao estoque disponível.");
                    if (quantity === 0) await tx.cartItem.deleteMany({ where: { userId, variantId: variant.id } });
                    else await tx.cartItem.upsert({ where, create: { userId, variantId: variant.id, quantity }, update: { quantity } });
                }
                const rows = await tx.cartItem.findMany({ where: { userId }, include: { variant: { include: { color: { include: { product: { include: productInclude } } } } } }, orderBy: { variantId: "asc" } });
                const items = [];
                for (const row of rows) {
                    const quantity = reconcile ? (row.variant.color.product.isPublished ? Math.min(row.quantity, row.variant.stock) : 0) : row.quantity;
                    if (quantity !== row.quantity) {
                        notices.push(`${row.variant.color.product.name}, tamanho ${row.variant.value}: quantidade ajustada ao estoque (${quantity}).`);
                        if (quantity) await tx.cartItem.update({ where: { userId_variantId: { userId, variantId: row.variantId } }, data: { quantity } });
                        else await tx.cartItem.delete({ where: { userId_variantId: { userId, variantId: row.variantId } } });
                    }
                    if (quantity) items.push({ product: row.variant.color.product, colorId: row.variant.colorId, variantId: row.variantId, size: row.variant.value, quantity });
                }
                return { items, notices };
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 4) continue;
            throw error;
        }
    }
}
