import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { orderIdSchema, confirmOrderSchema, advanceOrderSchema, cancelOrderSchema, orderListSchema } from "../schemas/order.schema.js";
import { confirmOrder, advanceOrder, cancelOrder, getOrder, listOrders, archiveOrder, orderReports, OrderError, listCustomerOrders } from "../services/order.service.js";
export async function myOrders(_req: Request, res: Response) {
  return res.json({ items: await listCustomerOrders(res.locals.account.id) });
}
export async function archive(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Pedido inválido." });
  try { return res.json(await archiveOrder(id.data)); }
  catch (error) { if (error instanceof OrderError) return res.status(error.status).json({ error: error.message }); return next(error); }
}
export async function reports(_req: Request, res: Response) {
  return res.json(await orderReports());
}
export async function statusCounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.order.groupBy({ by: ["status"], where: { archivedAt: null }, _count: { _all: true } });
    return res.json(Object.fromEntries(["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED", "COMPLETED", "CANCELLED"].map(status => [status, rows.find(row => row.status === status)?._count._all ?? 0])));
  } catch (error) { return next(error); }
}
export async function cancel(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  const input = cancelOrderSchema.safeParse(req.body);
  if (!id.success || !input.success) return res.status(400).json({ error: "Pedido ou status esperado inválido." });
  try { return res.json(await cancelOrder(id.data, input.data.expectedStatus)); }
  catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}
export async function advance(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  const input = advanceOrderSchema.safeParse(req.body);
  if (!id.success || !input.success) return res.status(400).json({ error: "Pedido ou status esperado inválido." });
  try { return res.json(await advanceOrder(id.data, input.data.expectedStatus)); }
  catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}
export async function list(req: Request, res: Response) {
  const input = orderListSchema.safeParse(req.query);
  if (!input.success) return res.status(400).json({ error: "Filtros ou paginação inválidos." });
  return res.json(await listOrders(input.data));
}
export async function details(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Pedido inválido." });
  try { return res.json(await getOrder(id.data)); }
  catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}
export async function confirm(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success || !confirmOrderSchema.safeParse(req.body ?? {}).success) return res.status(400).json({ error: "Pedido ou dados inválidos." });
  try { return res.json(await confirmOrder(id.data)); }
  catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json({ error: error.message, conflicts: error.conflicts });
    return next(error);
  }
}
