import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import type { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { lockCarouselSelection } from "../lib/carousel-lock.js";
import type { createProductSchema, updateProductSchema } from "../schemas/product.schema.js";
import { manualBadgeTextSchema } from "../schemas/product.schema.js";
export const productInclude = { category: { select: { id: true, name: true } }, colors: { orderBy: [{ position: "asc" }, { id: "asc" }], include: { variants: { orderBy: { id: "asc" } } } } } satisfies Prisma.ProductInclude;
export class ProductError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const getProducts = () => prisma.product.findMany({ include: productInclude });
export const getPublicProducts = () => prisma.product.findMany({ where: { isPublished: true }, include: productInclude });
// Only explicitly selected slides are public here; catalog publication is independent.
export const getCarouselProducts = () => prisma.product.findMany({ where: { inCarousel: true }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], take: 5, include: productInclude });
export const getProductById = (id: number) => prisma.product.findUnique({ where: { id }, include: productInclude });
export async function ensureInitialCarouselSelection(): Promise<number> {
    return prisma.$transaction(async tx => {
        await lockCarouselSelection(tx);
        const existingSelection = await tx.product.findFirst({ where: { inCarousel: true }, select: { id: true } });
        if (existingSelection) return 0;

        const candidates = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT "id" FROM "Product"
            WHERE "isPublished" = TRUE
            ORDER BY random()
            LIMIT 2
            FOR UPDATE
        `;
        if (!candidates.length) return 0;

        const result = await tx.product.updateMany({
            where: { id: { in: candidates.map(({ id }) => id) }, isPublished: true, inCarousel: false },
            data: { inCarousel: true }
        });
        const selected = await tx.product.findMany({ where: { inCarousel: true }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], select: { id: true } });
        for (const [carouselPosition, product] of selected.entries())
            await tx.product.update({ where: { id: product.id }, data: { carouselPosition } });
        return result.count;
    }, { isolationLevel: "ReadCommitted" });
}
export async function setProductCarousel(id: number, inCarousel: boolean) {
    return prisma.$transaction(async tx => {
        // One transaction-scoped lock for the shared five-product selection.
        // ReadCommitted ensures the count sees the previous lock holder's commit.
        await lockCarouselSelection(tx);
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
        const product = await tx.product.findUnique({ where: { id } });
        if (!product) throw new ProductError(404, "Produto não encontrado.");
        if (inCarousel && product.inCarousel) return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
        if (inCarousel && !product.inCarousel) {
            const count = await tx.product.count({ where: { inCarousel: true } });
            if (count >= 5) throw new ProductError(409, "Limite de 5 produtos no carrossel.");
            return tx.product.update({ where: { id }, data: { inCarousel: true, carouselPosition: count }, include: productInclude });
        }
        const updated = await tx.product.update({ where: { id }, data: { inCarousel: false, carouselPosition: 0 }, include: productInclude });
        const remaining = await tx.product.findMany({ where: { inCarousel: true }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], select: { id: true } });
        for (const [carouselPosition, selected] of remaining.entries())
            await tx.product.update({ where: { id: selected.id }, data: { carouselPosition } });
        return updated;
    }, { isolationLevel: "ReadCommitted" });
}
export async function setCarouselOrder(productIds: number[]) {
    return prisma.$transaction(async tx => {
        await lockCarouselSelection(tx);
        const selected = await tx.product.findMany({ where: { inCarousel: true }, select: { id: true } });
        if (selected.length !== productIds.length || selected.some(product => !productIds.includes(product.id)))
            throw new ProductError(409, "A seleção do carrossel mudou. Atualize a página e tente novamente.");
        for (const [carouselPosition, id] of productIds.entries())
            await tx.product.update({ where: { id }, data: { carouselPosition } });
        return tx.product.findMany({ where: { id: { in: productIds } }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], include: productInclude });
    }, { isolationLevel: "ReadCommitted" });
}
export async function createProduct(data: z.infer<typeof createProductSchema>) {
    if (data.colors.some(c => c.id !== undefined || c.variants.some(v => v.id !== undefined)))
        throw new ProductError(400, "Novas cores e variantes não devem informar IDs.");
    const { colors, ...product } = data;
    if (!await prisma.category.findUnique({ where: { id: product.categoryId } })) throw new ProductError(400, "Categoria não encontrada. Atualize a lista de categorias.");
    return prisma.product.create({ data: { ...product, price: String(product.price), colors: { create: colors.map(({ variants, ...color }, position) => ({
        ...color, position, variants: { create: variants }
    })) } }, include: productInclude });
}
export async function updateProduct(id: number, data: z.infer<typeof updateProductSchema>) {
    return prisma.$transaction(async tx => {
        // All edits of this product are serialized; membership is checked inside the transaction.
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.product.findUnique({ where: { id }, include: productInclude });
        if (!existing) throw new ProductError(404, "Produto não encontrado.");
        if (typeof data.badge === "string" && data.badge !== existing.badge && !manualBadgeTextSchema.safeParse(data.badge).success)
            throw new ProductError(400, "O badge deve ter no máximo 12 caracteres.");
        const { colors, ...product } = data;
        if (product.categoryId !== undefined && !await tx.category.findUnique({ where: { id: product.categoryId } })) throw new ProductError(400, "Categoria não encontrada. Atualize a lista de categorias.");
        if (colors) {
            for (const color of colors) {
                const old = existing.colors.find(c => c.id === color.id);
                if (color.id !== undefined && !old) throw new ProductError(400, "A cor não pertence a este produto.");
                if (color.variants.some(v => v.id !== undefined && !old?.variants.some(previous => previous.id === v.id)))
                    throw new ProductError(400, "A variante não pertence a esta cor.");
            }
            await tx.productColor.deleteMany({ where: { productId: id, id: { notIn: colors.flatMap(c => c.id === undefined ? [] : [c.id]) } } });
            for (const [position, color] of colors.entries()) {
                const { id: colorId, variants, ...fields } = color;
                if (colorId === undefined) {
                    await tx.productColor.create({ data: { ...fields, position, productId: id, variants: { create: variants } } });
                    continue;
                }
                await tx.productColor.update({ where: { id: colorId }, data: { ...fields, position } });
                const previous = existing.colors.find(c => c.id === colorId)!.variants;
                // Omitted variant IDs match by size for clients without IDs; explicit IDs preserve renames.
                const resolved = variants.map(v => ({ ...v, id: v.id ?? previous.find(p => p.value === v.value)?.id }));
                const keptIds = resolved.flatMap(v => v.id === undefined ? [] : [v.id]);
                if (new Set(keptIds).size !== keptIds.length) throw new ProductError(400, "Variante duplicada.");
                await tx.productVariant.deleteMany({ where: { colorId, id: { notIn: keptIds } } });
                // Temporarily free unique size labels, allowing swaps while retaining cart references.
                for (const v of resolved) if (v.id !== undefined && previous.find(p => p.id === v.id)?.value !== v.value)
                    await tx.productVariant.update({ where: { id: v.id }, data: { value: `__editing_${v.id}_${randomUUID()}` } });
                for (const { id: variantId, ...variant } of resolved) {
                    if (variantId === undefined) await tx.productVariant.create({ data: { ...variant, colorId } });
                    else await tx.productVariant.update({ where: { id: variantId }, data: variant });
                }
            }
        }
        return tx.product.update({ where: { id }, data: { ...product, ...(product.price === undefined ? {} : { price: String(product.price) }) }, include: productInclude });
    });
}
export async function deleteProduct(id: number) {
    return prisma.$transaction(async tx => {
        await lockCarouselSelection(tx);
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
        const deleted = await tx.product.delete({ where: { id } });
        const remaining = await tx.product.findMany({ where: { inCarousel: true }, orderBy: [{ carouselPosition: "asc" }, { id: "asc" }], select: { id: true } });
        for (const [carouselPosition, product] of remaining.entries())
            await tx.product.update({ where: { id: product.id }, data: { carouselPosition } });
        return deleted;
    }, { isolationLevel: "ReadCommitted" });
}
