import { manualBadgeMaxLength } from "../../../backend/src/lib/manual-badges.ts";
export const audiences = ["masculino", "feminino", "unissex", "infantil"];
export const labels: Record<string, string> = {
  masculino: "Masculino", feminino: "Feminino", unissex: "Unissex", infantil: "Infantil"
};
export interface ColorInput {
  id?: number; colorName: string; colorValue: string; imageUrl: string; images: string[];
  variants: { id?: number; value: string; stock: number }[];
}
export interface ProductInput {
  name: string; description: string; price: number; public: string; categoryId: number; isPublished: boolean;
  badge?: string | null; badgeBackgroundColor?: string; badgeTextColor?: string; colors: ColorInput[];
}
export interface ManagedProduct extends ProductInput { id: number; inCarousel: boolean; category: string }
export interface ColorDraft {
  key: string; id?: number; colorName: string; colorValue: string; imageUrl: string; images: string;
  variants: { id?: number; value: string; stock: string }[];
}
export interface ProductDraft {
  name: string; description: string; price: string; public: string; categoryId: string; isPublished: boolean; badge: string; badgeBackgroundColor: string; badgeTextColor: string;
  colors: ColorDraft[];
}
export const totalStock = (product: Pick<ProductInput, "colors">) => product.colors.reduce((sum, color) => sum + color.variants.reduce((n, v) => n + v.stock, 0), 0);
export const isLowStock = (stock: number, threshold: number) => stock >= 1 && stock <= threshold;
export const isEmptyVariant = (variant: { stock: number }) => variant.stock === 0;
type StockProduct = Pick<ProductInput, "colors">;
export const getProductVariants = (product: StockProduct) => product.colors.flatMap(color => color.variants);
export const getOutOfStockVariants = (product: StockProduct) => getProductVariants(product).filter(isEmptyVariant);
export const getLowStockVariants = (product: StockProduct, threshold: number) => getProductVariants(product).filter(variant => isLowStock(variant.stock, threshold));
export function isProductOutOfStock(product: StockProduct) {
  const variants = getProductVariants(product);
  return variants.length > 0 && variants.every(isEmptyVariant);
}
export const hasOutOfStockVariant = (product: StockProduct) => getOutOfStockVariants(product).length > 0 && getProductVariants(product).some(variant => variant.stock > 0);
export const hasLowStockVariant = (product: StockProduct, threshold: number) => getLowStockVariants(product, threshold).length > 0;
export type StockFilter = "" | "sem-estoque" | "variante-sem-estoque" | "variante-baixo";
export const stockFilterLabels: Record<Exclude<StockFilter, "">, string> = {
  "sem-estoque": "Produtos sem estoque", "variante-sem-estoque": "Variantes sem estoque", "variante-baixo": "Variantes com estoque baixo"
};
export function matchesStock(product: StockProduct, filter: StockFilter, threshold: number) {
  if (filter === "variante-baixo") return hasLowStockVariant(product, threshold);
  if (filter === "variante-sem-estoque") return hasOutOfStockVariant(product);
  return filter === "sem-estoque" ? isProductOutOfStock(product) : true;
}
export const normalizeHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
export function productStats(products: ManagedProduct[], threshold: number) {
  return { products: products.length, variants: products.reduce((n, p) => n + p.colors.reduce((n, c) => n + c.variants.length, 0), 0),
    stockedVariants: products.reduce((n, p) => n + p.colors.reduce((n, c) => n + c.variants.filter(v => v.stock > 0).length, 0), 0),
    emptyVariants: products.reduce((n, p) => n + p.colors.reduce((n, c) => n + c.variants.filter(isEmptyVariant).length, 0), 0),
    lowVariants: products.reduce((n, p) => n + getLowStockVariants(p, threshold).length, 0),
    empty: products.filter(isProductOutOfStock).length };
}
let nextColorKey = 0;
export function colorDraft(color?: ColorInput): ColorDraft {
  return { key: `color-${++nextColorKey}`, id: color?.id, colorName: color?.colorName ?? "", colorValue: normalizeHex(color?.colorValue ?? "") ?? color?.colorValue ?? "",
    imageUrl: color?.imageUrl ?? "", images: color?.images.join("\n") ?? "",
    variants: color?.variants.map(v => ({ ...v, stock: String(v.stock) })) ?? [{ value: "", stock: "0" }] };
}
export function toDraft(product?: ManagedProduct): ProductDraft {
  return { name: product?.name ?? "", description: product?.description ?? "", price: product ? String(product.price) : "",
    public: product?.public ?? "unissex", categoryId: product?.categoryId ? String(product.categoryId) : "", isPublished: product?.isPublished ?? true, badge: product?.badge ?? "",
    badgeBackgroundColor: product?.badgeBackgroundColor ?? "#2457A7", badgeTextColor: product?.badgeTextColor ?? "#FFFFFF",
    colors: product?.colors.map(colorDraft) ?? [colorDraft()] };
}
export function validateDraft(draft: ProductDraft, originalBadge?: string | null): string[] {
  const errors: string[] = [];
  if (draft.badge.length > manualBadgeMaxLength && draft.badge !== originalBadge) errors.push("O badge deve ter no máximo 12 caracteres.");
  if (draft.name.trim().length < 3) errors.push("O nome deve ter pelo menos 3 caracteres.");
  if (!draft.price.trim() || !Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0) errors.push("Informe um preço maior que zero.");
  if (!draft.public.trim() || !Number.isSafeInteger(Number(draft.categoryId)) || Number(draft.categoryId) <= 0) errors.push("Informe o público e a categoria.");
  if (!normalizeHex(draft.badgeBackgroundColor) || !normalizeHex(draft.badgeTextColor)) errors.push("Informe as cores do badge no formato HEX #RRGGBB.");
  if (!draft.colors.length) errors.push("Adicione pelo menos uma cor válida.");
  draft.colors.forEach((color, index) => {
    const prefix = `Cor ${index + 1} (${color.colorName || "sem nome"}): `;
    if (!color.colorName.trim()) errors.push(prefix + "informe o nome da cor.");
    if (!normalizeHex(color.colorValue)) errors.push(prefix + "informe o valor da cor no formato HEX #RRGGBB, por exemplo #1F2937.");
    const values = new Set<string>();
    color.variants.forEach((variant, i) => {
      const value = variant.value.trim();
      if (!value) errors.push(prefix + `variante ${i + 1}: informe um valor.`);
      if (values.has(value)) errors.push(prefix + `variante duplicada: ${value}.`);
      values.add(value);
      const stock = Number(variant.stock);
      if (!variant.stock.trim() || !Number.isInteger(stock) || stock < 0 || stock > 2147483647) errors.push(prefix + `variante ${i + 1}: estoque deve ser inteiro entre 0 e 2147483647.`);
    });
  });
  return errors;
}
export function toInput(draft: ProductDraft): ProductInput {
  return { name: draft.name.trim(), description: draft.description, price: Number(draft.price), public: draft.public, categoryId: Number(draft.categoryId), isPublished: draft.isPublished,
    badge: draft.badge.trim() || null, badgeBackgroundColor: normalizeHex(draft.badgeBackgroundColor)!, badgeTextColor: normalizeHex(draft.badgeTextColor)!, colors: draft.colors.map(color => ({ id: color.id,
      colorName: color.colorName.trim(), colorValue: normalizeHex(color.colorValue)!, imageUrl: color.imageUrl.trim(),
      images: color.images.split(/\r?\n/).map(i => i.trim()).filter(Boolean),
      variants: color.variants.map(v => ({ id: v.id, value: v.value.trim(), stock: Number(v.stock) })) })) };
}
