import { z } from "zod";
import { OrderStatus } from "../generated/prisma/enums.js";
export const orderIdSchema = z.coerce.number().int().positive().max(2147483647);
export const confirmOrderSchema = z.object({}).strict();
export const advanceOrderSchema = z.object({
  expectedStatus: z.enum(["PREPARING", "READY_OR_SHIPPED"])
}).strict();
export const cancelOrderSchema = z.object({
  expectedStatus: z.enum(["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED"])
}).strict();
export const orderListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(OrderStatus).optional(),
  sort: z.enum(["date", "number"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
}).strict();

// Relatório por período: datas locais (America/Sao_Paulo) inclusivas, AAAA-MM-DD.
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data inválida.");
export const reportPeriodSchema = z.object({
  start: isoDay, end: isoDay,
  groupBy: z.enum(["day", "week", "month", "year"]),
  compare: z.enum(["true", "false", "1", "0"]).optional().transform(value => value === "true" || value === "1"),
}).strict();
