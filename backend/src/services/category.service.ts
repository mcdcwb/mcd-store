import { prisma } from "../lib/prisma.js";
import { normalizeCategoryName } from "../schemas/category.schema.js";
export const categorySelect = { id: true, name: true } as const;
const adminCategorySelect = { ...categorySelect, _count: { select: { products: true } } } as const;
const administrativeCategory = ({ _count, ...category }: { id: number; name: string; _count: { products: number } }) => ({ ...category, productCount: _count.products });
export const availableProductWhere = { isPublished: true, colors: { some: { variants: { some: { stock: { gt: 0 } } } } } } as const;
export async function getCategories(availableOnly = false) {
  const orderBy = [{ name: "asc" }, { id: "asc" }] as const;
  if (availableOnly) return prisma.category.findMany({ where: { products: { some: availableProductWhere } }, select: categorySelect, orderBy: [...orderBy] });
  return (await prisma.category.findMany({ select: adminCategorySelect, orderBy: [...orderBy] })).map(administrativeCategory);
}
export const createCategory = async (name: string) => administrativeCategory(await prisma.category.create({ data: { name, normalizedName: normalizeCategoryName(name) }, select: adminCategorySelect }));
export const updateCategory = async (id: number, name: string) => administrativeCategory(await prisma.category.update({ where: { id }, data: { name, normalizedName: normalizeCategoryName(name) }, select: adminCategorySelect }));
// Restrictive FK also covers concurrent product creates/edits.
export const deleteCategory = (id: number) => prisma.category.delete({ where: { id }, select: categorySelect });
