import { type BadgeSelection, type StockBadgeSettings } from "../../../backend/src/lib/stock-badges";
import type { Product } from "../lib/products";
import { ProductBadge, type BadgeSize } from "./ProductBadge";
import { selectedStockBadge } from "../lib/selected-stock-badge";

export function ProductBadges({ product, settings, selection, size = "default", placement = "photo" }: { product: Product; settings: StockBadgeSettings | null; selection?: BadgeSelection; size?: BadgeSize; placement?: "photo" | "price" }) {
  const automatic = selectedStockBadge(product, settings, selection);
  if (placement === "price") return <span className="store-stock-slot">{automatic && <ProductBadge size={size} label={`${automatic === "last-unit" ? "ÚLTIMA PEÇA" : "POUCAS UNIDADES"}${selection?.size ? ` "${selection.size}"` : ""}`}
    background={automatic === "last-unit" ? "#B42332" : "#F0B429"} color={automatic === "last-unit" ? "#FFFFFF" : "#2C1A00"}
    className={`store-badge-automatic ${automatic === "last-unit" ? "store-stock-last" : "store-stock-low"}`} />}</span>;
  if (!product.badge) return null;
  return <div className="store-product-badges pointer-events-none absolute top-0 -left-px right-0 z-10" aria-label="Badges do produto">
    {product.badge && <div className="store-manual-badge-layer">
      <ProductBadge size={size} label={product.badge} background={product.badgeBackgroundColor} color={product.badgeTextColor} className="store-badge-manual" />
    </div>}
  </div>;
}
