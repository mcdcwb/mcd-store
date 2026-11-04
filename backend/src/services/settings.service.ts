import type { StoreSettings } from "../generated/prisma/client.js";
import { isBusinessHours } from "../lib/business-hours.js";

export const stockSettingsSelect = { lowStockThreshold: true, showLowStockBadge: true, showLastUnitBadge: true } as const;

export const storeDetailsSelect = {
  storeCep: true, storeStreet: true, storeNumber: true, storeComplement: true,
  storeNeighborhood: true, storeCity: true, storeState: true, whatsapp: true, businessHours: true
} as const;
type Details = Pick<StoreSettings, keyof typeof storeDetailsSelect>;
export function publicStoreDetails(row: Details) {
  const address = row.storeCep && row.storeStreet && row.storeNumber && row.storeNeighborhood && row.storeCity && row.storeState
    ? { cep: row.storeCep, street: row.storeStreet, number: row.storeNumber, complement: row.storeComplement ?? "",
        neighborhood: row.storeNeighborhood, city: row.storeCity, state: row.storeState } : null;
  if (!isBusinessHours(row.businessHours)) throw new Error("Horários da loja inválidos.");
  return { address, whatsapp: row.whatsapp, businessHours: row.businessHours };
}
export function storeDetailsData(address: { cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string } | null | undefined, whatsapp: string | null | undefined) {
  return { ...(address === undefined ? {} : { storeCep: address?.cep ?? null, storeStreet: address?.street ?? null, storeNumber: address?.number ?? null,
    storeComplement: address?.complement ?? null, storeNeighborhood: address?.neighborhood ?? null,
    storeCity: address?.city ?? null, storeState: address?.state ?? null }), ...(whatsapp === undefined ? {} : { whatsapp }) };
}
