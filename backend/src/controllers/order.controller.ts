import { maskOrderForDemo } from "../lib/demo-privacy.js";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { orderIdSchema, confirmOrderSchema, advanceOrderSchema, cancelOrderSchema, orderListSchema, reportPeriodSchema } from "../schemas/order.schema.js";
import { confirmOrder, advanceOrder, cancelOrder, getOrder, listOrders, archiveOrder, orderReports, periodReport, OrderError, listCustomerOrders } from "../services/order.service.js";
// Painel demonstrativo: dados pessoais de clientes reais saem mascarados (lib/demo-privacy.ts).
const isDemo = (res: Response) => res.locals.account?.role === "DEMO";
export async function myOrders(_req: Request, res: Response) {
  return res.json({ items: await listCustomerOrders(res.locals.account.id) });
}
export async function archive(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Pedido inválido." });
  try { return res.json(await archiveOrder(id.data)); }
  catch (error) { if (error instanceof OrderError) return res.status(error.status).json({ error: error.message }); return next(error); }
}
export async function reports(req: Request, res: Response, next: NextFunction) {
  try {
    // Sem parâmetros: resumo usado pelo Dashboard (inalterado). Com start/end: relatório do período.
    if (!Object.keys(req.query).length) return res.json(await orderReports());
    const input = reportPeriodSchema.safeParse(req.query);
    if (!input.success) return res.status(400).json({ error: "Período inválido. Informe start e end (AAAA-MM-DD) e groupBy (day, week, month ou year)." });
    return res.json(await periodReport(input.data));
  } catch (error) { if (error instanceof OrderError) return res.status(error.status).json({ error: error.message }); return next(error); }
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
  const page = await listOrders(input.data);
  return res.json(isDemo(res) ? { ...page, items: page.items.map(maskOrderForDemo) } : page);
}
export async function details(req: Request, res: Response, next: NextFunction) {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Pedido inválido." });
  try { const order = await getOrder(id.data); return res.json(isDemo(res) ? maskOrderForDemo(order) : order); }
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
