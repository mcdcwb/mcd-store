import { z } from "zod";
export const categoryName = z.string().transform(name => name.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1, "Informe o nome da categoria.").max(80, "O nome deve ter até 80 caracteres."));
export const categorySchema = z.strictObject({ name: categoryName });
export const normalizeCategoryName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
