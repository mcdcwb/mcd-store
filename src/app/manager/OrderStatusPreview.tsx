import { useEffect, useState } from "react";
import type { createManagerApi } from "./api";
import { orderDate, orderMoney, type OrderStatus } from "./orders";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OrderStatusPreview({ api, status, onUnauthorized }: { api: ReturnType<typeof createManagerApi>; status: string; onUnauthorized: (message: string) => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.orders>> | null>(null); const [error, setError] = useState("");
  useEffect(() => { const abort = new AbortController(); setError(""); const query = { search: "", status: status as OrderStatus | "", sort: "date" as const, direction: "desc" as const, page: 1 }; api.orders(query, abort.signal).then(setResult).catch(reason => { if (!abort.signal.aborted) { setError(reason.message); if ([401, 403].includes(reason.status)) onUnauthorized(reason.message); } }); return () => abort.abort(); }, [api, status, onUnauthorized]);
  if (error) return <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>;
  if (!result) return <p role="status" className="mt-4 text-sm text-muted-foreground">Carregando pedidos...</p>;
  return <div className="mt-4 space-y-2">{result.items.length ? result.items.slice(0, 5).map(order => <article key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3 text-sm md:grid-cols-[minmax(0,1fr)_6rem_7.5rem_13.5rem] md:gap-x-6"><span className="col-span-2 min-w-0 truncate md:col-span-1">#{order.number} · {order.customerName}</span><span className="text-muted-foreground tabular-nums">{orderDate(order.createdAt)}</span><span className="text-right font-semibold tabular-nums">{orderMoney(order.total)}</span><OrderStatusBadge status={order.status} fulfillmentMethod={order.fulfillmentMethod} className="col-span-2 justify-self-start md:col-span-1 md:justify-self-auto" /></article>) : <p className="py-5 text-center text-sm text-muted-foreground">Nenhum pedido operacional neste filtro.</p>}<a href="/manager/pedidos" className="inline-block pt-2 text-sm text-primary underline">Abrir pedidos</a></div>;
}
