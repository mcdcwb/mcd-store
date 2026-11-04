import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { OrderStatus } from "../../../backend/src/generated/prisma/enums";
import type { FulfillmentMethod } from "../../../backend/src/generated/prisma/enums";
import { orderDate, orderMoney } from "../manager/orders";
import type { Address } from "../lib/address";

type CustomerOrder = {
  id: number; number: string; createdAt: string; status: OrderStatus; fulfillmentMethod: FulfillmentMethod;
  deliveryAddress: Address | null; pickupAddress: Address | null; total: string;
  statusEvents: { status: OrderStatus; createdAt: string }[];
  items: { id: number; productName: string; colorName: string; size: string; quantity: number; unitPrice: string; subtotal: string }[];
};
function customerStatus(status: OrderStatus, method: FulfillmentMethod) {
  if (status === "PENDING_CONFIRMATION") return "Aguardando confirma\u00e7\u00e3o";
  if (status === "PREPARING") return "Em prepara\u00e7\u00e3o";
  if (status === "READY_OR_SHIPPED") return method === "DELIVERY" ? "Enviado" : "Pronto para retirada";
  if (status === "COMPLETED") return "Finalizado";
  return "Cancelado";
}
function customerStatusClass(status: OrderStatus, method: FulfillmentMethod) {
  if (status === "PREPARING") return "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
  if (status === "READY_OR_SHIPPED" && method === "PICKUP") return "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (status === "COMPLETED") return "border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  if (status === "CANCELLED") return "border border-destructive/20 bg-destructive/10 text-destructive";
  return "border border-primary/20 bg-primary/10 text-primary";
}
function customerEventLabel(status: OrderStatus, method: FulfillmentMethod) {
  if (status === "PENDING_CONFIRMATION") return "Pedido solicitado — aguardando confirmação";
  if (status === "PREPARING") return "Pedido aceito e em preparação";
  if (status === "READY_OR_SHIPPED") return method === "DELIVERY" ? "Pedido enviado" : "Pedido aguardando retirada";
  if (status === "COMPLETED") return "Pedido finalizado";
  return "Pedido cancelado";
}
export function MyOrdersPage({ token, onLogin }: { token?: string; onLogin: () => void }) {
  const location = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, []);
  const expandedOrderId = (location.state as { expandedOrderId?: number } | null)?.expandedOrderId;
  const [items, setItems] = useState<CustomerOrder[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(() =>
    Number.isSafeInteger(expandedOrderId) ? new Set([expandedOrderId as number]) : new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError("");
    fetch((import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") + "/orders/mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "NÃ£o foi possÃ­vel carregar seus pedidos."); return data as { items: CustomerOrder[] }; })
      .then(data => { if (!controller.signal.aborted) setItems(data.items); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel carregar seus pedidos."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, revision]);
  return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 min-h-[60vh]">
    <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" size={16} className="mr-2" />Voltar para a loja</Link>
    <h1 className="mt-6 font-serif text-3xl font-bold">Meus Pedidos</h1>
    {!token ? <section className="mt-6 rounded-xl border border-border bg-card p-6"><p>Entre com sua conta de cliente para consultar seus pedidos.</p><button onClick={onLogin} className="mt-4 rounded-lg bg-primary px-5 py-2 text-primary-foreground">Entrar</button></section>
      : loading ? <p role="status" className="mt-6">Carregando seus pedidos...</p>
        : error ? <section className="mt-6 rounded-xl border border-destructive/20 bg-card p-6"><p role="alert" className="text-destructive">{error}</p><button onClick={() => setRevision(value => value + 1)} className="mt-3 text-primary underline">Tentar novamente</button></section>
          : !items.length ? <p className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Você ainda não tem pedidos.</p>
            : <div className="mt-6 space-y-4">{items.map(order => {
              const expanded = expandedOrders.has(order.id);
              const detailsId = `order-details-${order.id}`;
              return <article key={order.id} aria-label={`Pedido #${order.number}`} className="rounded-xl border border-border bg-card p-4 sm:p-6">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedOrders(current => {
                    const next = new Set(current);
                    if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                    return next;
                  })} className="group min-w-0 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <h2 className="font-semibold">Pedido #{order.number}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{orderDate(order.createdAt, true)}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary shadow-sm transition-colors group-hover:bg-primary/10 group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-primary/30">
                      {expanded ? "Recolher detalhes" : "Ver detalhes"}
                      <ChevronDown aria-hidden="true" size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${customerStatusClass(order.status, order.fulfillmentMethod)}`}>{customerStatus(order.status, order.fulfillmentMethod)}</span>
                </header>
                {expanded && <div id={detailsId} className="mt-4 border-t border-border pt-1">
                  <p className="mt-4 text-sm"><strong>Recebimento:</strong> {order.fulfillmentMethod === "DELIVERY" ? "Entrega" : "Retirada na loja"}</p>
                  {order.fulfillmentMethod === "DELIVERY" && order.deliveryAddress && <address className="mt-2 text-sm not-italic text-muted-foreground">{order.deliveryAddress.street}, {order.deliveryAddress.number}{order.deliveryAddress.complement ? `, ${order.deliveryAddress.complement}` : ""}<br />{order.deliveryAddress.neighborhood}, {order.deliveryAddress.city} - {order.deliveryAddress.state}<br />CEP {order.deliveryAddress.cep}</address>}
                  <ul className="mt-4 divide-y divide-border">{order.items.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{item.quantity}× {item.productName}</p><p className="text-muted-foreground">Cor: {item.colorName} · Tamanho: {item.size}</p><p className="text-muted-foreground">{orderMoney(item.unitPrice)} cada</p></div><p className="font-medium">{orderMoney(item.subtotal)}</p></li>)}</ul>
                  <div className="mt-3 flex justify-end border-t border-border pt-3 text-lg font-bold">Total: {orderMoney(order.total)}</div>
                  <section aria-label={`Histórico do pedido ${order.number}`} className="mt-5 border-t border-border pt-4">
                    <h3 className="font-semibold">Histórico do pedido</h3>
                    <ol className="mt-3 space-y-3">
                      {order.statusEvents.map((event, index) => <li key={`${event.status}-${event.createdAt}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                        <span>{customerEventLabel(event.status, order.fulfillmentMethod)}</span>
                        <time dateTime={event.createdAt} className="text-muted-foreground">{orderDate(event.createdAt, true)}</time>
                      </li>)}
                    </ol>
                  </section>
                </div>}
              </article>;
            })}</div>}
  </main>;
}