import { categoryValue, type Product } from "./products.ts";

/** Use the unfiltered public catalog; stable IDs break ties without randomness. */
export function relatedProducts(current: Product, catalog: readonly Product[]): Product[] {
  const eligible = new Map<number, Product>();
  for (const product of catalog) {
    if (product.id !== current.id && product.isPublished && !eligible.has(product.id)) eligible.set(product.id, product);
  }
  const priority = (product: Product) => categoryValue(product) === categoryValue(current) ? 0
    : product.public === current.public || product.public === "unissex" || current.public === "unissex" ? 1 : 2;
  return [...eligible.values()].sort((a, b) => priority(a) - priority(b) || a.id - b.id).slice(0, 3);
}
