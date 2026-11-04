export interface Category { id: number; name: string; productCount?: number }

export function adaptCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) throw new Error("Resposta inválida das categorias.");
  const ids = new Set<number>();
  return value.map(category => {
    if (!category || !Number.isSafeInteger(category.id) || category.id <= 0 || typeof category.name !== "string" || !category.name.trim() || ids.has(category.id))
      throw new Error("Resposta inválida das categorias.");
    ids.add(category.id);
    if (category.productCount !== undefined && (!Number.isSafeInteger(category.productCount) || category.productCount < 0)) throw new Error("Resposta inválida das categorias.");
    return { id: category.id, name: category.name, ...(category.productCount === undefined ? {} : { productCount: category.productCount }) };
  });
}
