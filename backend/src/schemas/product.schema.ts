import { z } from "zod";
import { manualBadgeMaxLength } from "../lib/manual-badges.js";
export const manualBadgeTextSchema = z.string().max(manualBadgeMaxLength, "O badge deve ter no máximo 12 caracteres.");
const badgeColor = z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Informe HEX #RRGGBB para o badge.").transform(v => v.toUpperCase());
const id = z.number().int().positive().max(2147483647);
export const carouselSchema = z.strictObject({ inCarousel: z.boolean() });
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
    id: id.optional(), colorName: z.string().trim().min(1, "Informe o nome da cor."),
    colorValue: z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Informe HEX #RRGGBB.").transform(v => v.toUpperCase()),
    imageUrl: z.string().trim().optional(), images: z.array(z.string().trim().min(1)), variants: variantsSchema
});
const colorsSchema = z.array(productColorSchema).min(1, "Adicione pelo menos uma cor.").superRefine((colors, ctx) => {
    const ids = colors.flatMap(c => c.id === undefined ? [] : [c.id]);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "ID de cor duplicado." });
});
export const createProductSchema = z.strictObject({
    name: z.string().trim().min(3, "O nome deve possuir pelo menos 3 caracteres"),
    description: z.string().optional(), price: z.number().positive("O preço deve ser maior que zero"),
    public: z.string().trim().min(1), categoryId: id, isPublished: z.boolean().optional(),
    badge: manualBadgeTextSchema.nullable().optional(), badgeBackgroundColor: badgeColor.optional(), badgeTextColor: badgeColor.optional(), colors: colorsSchema
});
// Updates can retain an identical legacy badge; the service checks it under the product lock.
export const updateProductSchema = createProductSchema.omit({ badge: true }).partial().extend({ badge: z.string().nullable().optional() }).refine(data => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar."
});
