import { adaptProduct, selectProductColor } from "./products";
import type { CartItem } from "../hooks/useShopping";
import type { Address } from "./address";
export { moneyFromCents } from "../../../backend/src/lib/checkout-message";
export type FulfillmentMethod = "DELIVERY" | "PICKUP";
export interface CheckoutItem extends CartItem { variantId: number; unitPriceCents: number; subtotalCents: number }
export interface CheckoutReview {
  items: CheckoutItem[]; totalCents: number; reviewKey: string;
  conflicts: { variantId: number; message: string }[];
}
export interface ReviewedContext { customerName: string; address: Address | null; pickupAddress: Address | null; whatsapp: string | null }
export class CheckoutRequestError extends Error {
  constructor(message: string, public status: number, public review?: CheckoutReview) { super(message); }
}
function adaptReview(data: CheckoutReview): CheckoutReview {
  if (!Array.isArray(data.items) || !Array.isArray(data.conflicts) || !Number.isSafeInteger(data.totalCents) || data.totalCents < 0 || !/^[a-f0-9]{64}$/.test(data.reviewKey))
    throw new Error("A conferência retornou dados inválidos.");
  const items = data.items.map(item => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 1 ||
      !Number.isSafeInteger(item.subtotalCents) || item.subtotalCents !== item.unitPriceCents * item.quantity)
      throw new Error("Um item retornou valores inválidos.");
    return { ...item, product: selectProductColor(adaptProduct(item.product), item.colorId) };
  });
  if (items.reduce((total, item) => total + item.subtotalCents, 0) !== data.totalCents) throw new Error("O total dos produtos retornou um valor inválido.");
  return { ...data, items };
}
async function request(token: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch((import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") + "/checkout" + (body ? "/whatsapp" : ""), {
    method: body ? "POST" : "GET", signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new CheckoutRequestError(data.error || "Não foi possível conferir o pedido.", response.status, data.review ? adaptReview(data.review) : undefined);
  return data;
}
export async function fetchCheckoutReview(token: string, signal: AbortSignal) { return adaptReview(await request(token, signal)); }
export async function prepareWhatsapp(token: string, method: FulfillmentMethod, reviewKey: string, reviewedContext: ReviewedContext, signal: AbortSignal, idempotencyKey: string): Promise<{ url: string; orderId: number }> {
  const data = await request(token, signal, { fulfillmentMethod: method, reviewKey, reviewedContext, idempotencyKey });
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.hostname !== "wa.me" || !/^\/55\d{10,11}$/.test(url.pathname) || url.username || url.password || url.port)
    throw new Error("O contato da loja retornou um link inválido.");
  if (!Number.isSafeInteger(data.order?.id) || data.order.id < 1) throw new Error("O pedido retornou um identificador inválido.");
  return { url: url.toString(), orderId: data.order.id };
}
const draftKey = "mcd-store_checkout_v1";
export function readCheckoutMethod(userId: number): FulfillmentMethod | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
    return draft?.userId === userId && (draft.method === "DELIVERY" || draft.method === "PICKUP") ? draft.method : null;
  } catch { return null; }
}
export function saveCheckoutMethod(userId: number, method: FulfillmentMethod | null) {
  try { sessionStorage.setItem(draftKey, JSON.stringify({ userId, method })); } catch { /* Choice still works in memory. */ }
}
export function clearCheckoutDraft() { try { sessionStorage.removeItem(draftKey); } catch { /* Storage unavailable. */ } }
