import type { Account } from "./auth";
import { announceDemoBlock, readDemoBlock } from "./demo";

import type { Address } from "./address";
export { emptyAddress, formatCep, lookupCep, type Address } from "./address";
export interface Profile { account: Account & { phone: string | null }; address: Address | null }
export async function accountRequest<T>(token: string, method = "GET", body?: unknown, path = "/conta", signal?: AbortSignal): Promise<T> {
  const response = await fetch((import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") + path, {
    method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const demoBlock = await readDemoBlock(response);
  if (demoBlock) { announceDemoBlock(demoBlock); throw new Error(demoBlock); }
  const data = await response.json().catch(() => { throw new Error("Resposta inválida do servidor. Tente novamente."); });
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar. Tente novamente.");
  return data;
}
