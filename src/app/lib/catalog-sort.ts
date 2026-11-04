export type CatalogSort = { field: "name" | "price"; direction: "asc" | "desc" } | null;

const names = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function toggleCatalogSort(current: CatalogSort, field: NonNullable<CatalogSort>["field"]): CatalogSort {
  return { field, direction: current?.field === field && current.direction === "asc" ? "desc" : "asc" };
}

export function sortCatalog<T extends { name: string; price: number }>(products: readonly T[], sort: CatalogSort): T[] {
  if (!sort) return [...products];
  const direction = sort.direction === "asc" ? 1 : -1;
  // Stable sorting retains catalog order for equal prices or equivalent names.
  return [...products].sort((a, b) => direction * (sort.field === "name" ? names.compare(a.name, b.name) : a.price - b.price));
}
