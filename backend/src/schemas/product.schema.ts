import { z } from "zod";
import { manualBadgeMaxLength } from "../lib/manual-badges.js";
export const manualBadgeTextSchema = z.string().max(manualBadgeMaxLength, "O badge deve ter no máximo 12 caracteres.");
const badgeColor = z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Informe HEX #RRGGBB para o badge.").transform(v => v.toUpperCase());
const id = z.number().int().positive().max(2147483647);
export const carouselSchema = z.strictObject({ inCarousel: z.boolean() });
export const carouselImageFits = ["CONTAIN", "COVER"] as const;
export const carouselImageFocuses = ["CENTER", "TOP", "BOTTOM", "LEFT", "RIGHT"] as const;
export const carouselDisplaySchema = z.strictObject({ fit: z.enum(carouselImageFits), focus: z.enum(carouselImageFocuses) });
export const carouselOrderSchema = z.strictObject({
    productIds: z.array(id).min(1).max(5).refine(ids => new Set(ids).size === ids.length, "Produtos duplicados na ordem do carrossel.")
});
export const productVariantSchema = z.strictObject({
    id: id.optional(),
    value: z.string().trim().min(1, "Informe o valor da variante."),
    stock: z.number().int().min(0).max(2147483647)
});
const variantsSchema = z.array(productVariantSchema).superRefine((variants, ctx) => {
    const values = new Set<string>(), ids = new Set<number>();
    variants.forEach((variant, index) => {
        if (values.has(variant.value) || (variant.id !== undefined && ids.has(variant.id)))
            ctx.addIssue({ code: "custom", path: [index], message: "Variante duplicada nesta cor." });
        values.add(variant.value);
        if (variant.id !== undefined) ids.add(variant.id);
    });
});
export const productColorSchema = z.strictObject({
    // Nome e HEX podem vir vazios só em produto não publicado (viram a cor interna do banner no service).
    id: id.optional(), colorName: z.string().trim(),
    colorValue: z.string().trim().regex(/^(#[0-9a-f]{6})?$/i, "Informe HEX #RRGGBB.").transform(v => v.toUpperCase()),
    imageUrl: z.string().trim().optional(), images: z.array(z.string().trim().min(1)), variants: variantsSchema
});
// Pode vir vazio em produto não publicado; a exigência para publicados fica no service.
const colorsSchema = z.array(productColorSchema).superRefine((colors, ctx) => {
    const ids = colors.flatMap(c => c.id === undefined ? [] : [c.id]);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "ID de cor duplicado." });
});
export const createProductSchema = z.strictObject({
    // Nome "", preço 0 e cores vazias são aceitos quando não publicado; a exigência para publicados
    // fica no service (product-publishing.ts), que vale também em edições parciais.
    name: z.string().trim(),
    description: z.string().optional(), price: z.number().min(0, "O preço não pode ser negativo."),
    public: z.string().trim().min(1), categoryId: id, isPublished: z.boolean().optional(),
    badge: manualBadgeTextSchema.nullable().optional(), badgeBackgroundColor: badgeColor.optional(), badgeTextColor: badgeColor.optional(), colors: colorsSchema
});
// Updates can retain an identical legacy badge; the service checks it under the product lock.
export const updateProductSchema = createProductSchema.omit({ badge: true }).partial().extend({ badge: z.string().nullable().optional() }).refine(data => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar."
});
