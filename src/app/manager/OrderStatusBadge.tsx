import { CheckCircle2, CircleX, Clock3, PackageCheck, Store, Truck, type LucideIcon } from "lucide-react";
import { orderStatusLabel, type OrderStatus } from "./orders";
import type { FulfillmentMethod } from "../../../backend/src/generated/prisma/enums";

// Selo de status padronizado: mesma altura, padding, raio, fonte e — a partir de md — a mesma
// largura para todos os status (cabe o maior, "Aguardando confirmação"), com ícone + texto centralizados.
// Usado na lista e no detalhe de pedidos do painel, na prévia do Dashboard e em "Meus pedidos".
export const ORDER_STATUS_BADGE_WIDTH = "13.5rem";

const tones: Record<string, [string, LucideIcon]> = {
  PENDING_CONFIRMATION: ["border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200", Clock3],
  PREPARING: ["border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950/70 dark:text-sky-200", PackageCheck],
  READY_OR_SHIPPED_PICKUP: ["border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200", Store],
  READY_OR_SHIPPED_DELIVERY: ["border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-200", Truck],
  COMPLETED: ["border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100", CheckCircle2],
  CANCELLED: ["border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-200", CircleX],
};

export function OrderStatusBadge({ status, fulfillmentMethod, className = "" }: {
  status: OrderStatus; fulfillmentMethod: FulfillmentMethod; className?: string;
}) {
  const [tone, Icon] = tones[status === "READY_OR_SHIPPED" ? `READY_OR_SHIPPED_${fulfillmentMethod}` : status];
  return <span data-order-status={status}
    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold leading-none shadow-sm md:w-[var(--order-status-width)] ${tone} ${className}`}
    style={{ ["--order-status-width" as string]: ORDER_STATUS_BADGE_WIDTH }}>
    <Icon aria-hidden="true" size={15} strokeWidth={2.25} className="shrink-0" />{orderStatusLabel(status, fulfillmentMethod)}
  </span>;
}
