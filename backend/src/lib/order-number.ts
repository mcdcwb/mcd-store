import { BUSINESS_TIME_ZONE } from "../config/business.js";
export function orderNumber(sequence: number, createdAt: Date): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 2147483647) throw new RangeError("Limite de numeração de pedidos atingido.");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(createdAt);
  const year = parts.find(p => p.type === "year")!.value.slice(-2);
  const month = parts.find(p => p.type === "month")!.value;
  return `${year}${month}${String(sequence).padStart(4, "0")}`;
}
