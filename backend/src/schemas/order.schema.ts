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
