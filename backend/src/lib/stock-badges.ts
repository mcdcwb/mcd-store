export interface StockBadgeSettings {
  lowStockThreshold: number;
  showLowStockBadge: boolean;
  showLastUnitBadge: boolean;
}

export function isStockBadgeSettings(value: unknown): value is StockBadgeSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as StockBadgeSettings;
  return Number.isInteger(settings.lowStockThreshold) && settings.lowStockThreshold >= 1 && settings.lowStockThreshold <= 9999
    && typeof settings.showLowStockBadge === "boolean" && typeof settings.showLastUnitBadge === "boolean";
}

export interface BadgeSelection { colorId?: number; size?: string; sizes?: readonly string[] }
export function stockBadge(product: { colors: readonly { id?: number; variants: readonly { value?: string; stock: number }[] }[] }, settings: StockBadgeSettings | null, selection: BadgeSelection = {}): "last-unit" | "low-stock" | null {
  if (!settings) return null;
  const variants = product.colors.filter(color => selection.colorId === undefined || color.id === selection.colorId)
    .flatMap(color => color.variants).filter(variant => selection.size === undefined || variant.value === selection.size).filter(variant => selection.size !== undefined || !selection.sizes?.length || selection.sizes.includes(variant.value ?? ""));
  if (settings.showLastUnitBadge && variants.some(variant => variant.stock === 1)) return "last-unit";
  if (settings.showLowStockBadge && variants.some(variant => variant.stock > 0 && variant.stock <= settings.lowStockThreshold)) return "low-stock";
  return null;
}
