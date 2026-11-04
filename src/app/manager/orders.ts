import { OrderStatus, type FulfillmentMethod } from "../../../backend/src/generated/prisma/enums.ts";
import { BUSINESS_TIME_ZONE } from "../../../backend/src/config/business.ts";
import type { Address } from "../lib/address.ts";
export type { OrderStatus };
export type CancellableOrderStatus = Extract<OrderStatus, "PENDING_CONFIRMATION" | "PREPARING" | "READY_OR_SHIPPED">;
export function canCancelOrder(status: OrderStatus): status is CancellableOrderStatus {
  return status === "PENDING_CONFIRMATION" || status === "PREPARING" || status === "READY_OR_SHIPPED";
}
export function orderCancellationDescription(status: CancellableOrderStatus) {
  return status === "PENDING_CONFIRMATION"
    ? "Este pedido ainda não foi confirmado e não houve baixa de estoque."
    : "O estoque deste pedido será devolvido.";
}
export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "Aguardando confirmação", PREPARING: "Em preparação",
  READY_OR_SHIPPED: "Pronto ou enviado", COMPLETED: "Finalizado", CANCELLED: "Cancelado"
};
export interface OrderSummary {
  id: number; number: string; sequence: number; customerName: string; createdAt: string;
  total: string; fulfillmentMethod: FulfillmentMethod; status: OrderStatus;
}
export function orderStatusLabel(status: OrderStatus, fulfillmentMethod: FulfillmentMethod) {
  return status === "READY_OR_SHIPPED"
    ? fulfillmentMethod === "DELIVERY" ? "Enviado" : "Pronto para retirada"
    : orderStatusLabels[status];
}
export function orderAction(order: Pick<OrderSummary, "status" | "fulfillmentMethod" | "number">) {
  if (order.status === "PENDING_CONFIRMATION") return { label: "Confirmar pedido", title: `Confirmar o pedido #${order.number}?` };
  if (order.status === "PREPARING") return order.fulfillmentMethod === "DELIVERY"
    ? { label: "Marcar como enviado", title: `Marcar o pedido #${order.number} como enviado?` }
    : { label: "Marcar como pronto para retirada", title: `Marcar o pedido #${order.number} como pronto para retirada?` };
  if (order.status === "READY_OR_SHIPPED") return { label: "Finalizar pedido", title: `Finalizar o pedido #${order.number}?` };
  return null;
}
export interface OrderDetails extends OrderSummary {
  updatedAt: string; completedAt: string | null; archivedAt: string | null; customerPhone: string | null; deliveryAddress: Address | null; pickupAddress: Address | null;
  items: { id: number; productName: string; colorName: string; size: string; quantity: number; unitPrice: string; subtotal: string }[];
}
export interface OrderPage { items: OrderSummary[]; total: number; page: number; pageSize: number; totalPages: number }
export interface OrderQuery { search: string; status: OrderStatus | ""; sort: "date" | "number"; direction: "asc" | "desc"; page: number }
export interface StockConflict { variantId: number; productName: string; colorName: string; size: string; requested: number; available: number }
export function orderMoney(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Valor do pedido inválido.");
  const [whole, cents = ""] = value.split(".");
  return `R$ ${BigInt(whole).toLocaleString("pt-BR")},${cents.padEnd(2, "0")}`;
}
export function orderDate(value: string, time = false) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: BUSINESS_TIME_ZONE, dateStyle: "short", ...(time ? { timeStyle: "short" } : {}) }).format(new Date(value));
}
export function orderQueryString(query: OrderQuery) {
  const params = new URLSearchParams({ sort: query.sort, direction: query.direction, page: String(query.page) });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.status) params.set("status", query.status);
  return params.toString();
}
