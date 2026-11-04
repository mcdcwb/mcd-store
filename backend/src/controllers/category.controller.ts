import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { categorySchema } from "../schemas/category.schema.js";
import * as service from "../services/category.service.js";
function failure(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return res.status(409).json({ error: "Já existe uma categoria com este nome." });
    if (error.code === "P2003") return res.status(409).json({ error: "Não é possível excluir esta categoria porque existem produtos associados a ela." });
    if (error.code === "P2025") return res.status(404).json({ error: "Categoria não encontrada." });
  }
  return next(error);
}
export async function listAvailableCategories(_req: Request, res: Response) {
  res.set("Cache-Control", "no-store").json(await service.getCategories(true));
}
export async function listCategories(_req: Request, res: Response) {
  res.set("Cache-Control", "no-store").json(await service.getCategories());
}
export async function saveCategory(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id === undefined ? undefined : Number(req.params.id);
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) return res.status(400).json({ error: "ID inválido." });
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Nome de categoria inválido.", errors: parsed.error.issues });
  try {
    return res.status(id === undefined ? 201 : 200).json(id === undefined ? await service.createCategory(parsed.data.name) : await service.updateCategory(id, parsed.data.name));
  } catch (error) { return failure(error, res, next); }
}
export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return res.status(400).json({ error: "ID inválido." });
  try { await service.deleteCategory(id); return res.json({ message: "Categoria excluída com sucesso." }); }
  catch (error) { return failure(error, res, next); }
}
