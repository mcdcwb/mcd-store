import type { Address } from "./address";
import { isStockBadgeSettings, type StockBadgeSettings } from "../../../backend/src/lib/stock-badges.ts";
import { isBusinessHours, type BusinessHours } from "./business-hours.ts";
export { normalizeWhatsapp, formatWhatsapp, whatsappUrl } from "../../../backend/src/lib/store-contact";
export interface StoreDetails { address: Address | null; whatsapp: string | null; businessHours: BusinessHours | null; stockBadges?: StockBadgeSettings | null }
type StoreDetailsInput = Partial<Pick<StoreDetails, "address" | "whatsapp">> & { businessHours?: BusinessHours };
export const emptyStoreDetails: StoreDetails = { address: null, whatsapp: null, businessHours: null };
export async function storeDetailsRequest(token?: string, body?: StoreDetailsInput, signal?: AbortSignal): Promise<StoreDetails> {
  const response = await fetch((import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") + (token ? "/settings/store" : "/settings/public"), {
    method: body ? "PUT" : "GET", signal, cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 401 || response.status === 403) throw new Error("Sua sessão administrativa não está autorizada. Entre novamente.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar os dados da loja.");
  if (!(data.address === null || typeof data.address === "object") || !(data.whatsapp === null || typeof data.whatsapp === "string")) throw new Error("Dados da loja inválidos.");
  if (data.businessHours !== undefined && !isBusinessHours(data.businessHours)) throw new Error("Horários da loja inválidos.");
  return { address: data.address, whatsapp: data.whatsapp, businessHours: data.businessHours ?? null, stockBadges: isStockBadgeSettings(data) ? { lowStockThreshold: data.lowStockThreshold, showLowStockBadge: data.showLowStockBadge, showLastUnitBadge: data.showLastUnitBadge } : null };
}
