import { Link } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { orderMoney } from "./orders";

export type DashboardReport = {
  revenue: string; completedOrders: number; averageTicket: string; totalOrders: number; hasDemoData: boolean;
  weekly: { week: string; revenue: string; orders: number }[];
  topProducts: { productName: string; quantity: number }[];
};

const weekLabel = (week: string) => { const [, month, day] = week.split("-"); return `${day}/${month}`; };
const compactMoney = (value: number) => value >= 1000 ? `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${value}`;

// Carregado sob demanda (recharts fica fora do pacote principal), como a página de Relatórios.
export function DashboardSales({ report }: { report: DashboardReport }) {
  const data = report.weekly.map(item => ({ ...item, label: weekLabel(item.week), revenue: Number(item.revenue) }));
  const hasSales = data.some(item => item.revenue > 0 || item.orders > 0);
  return <div className="mb-6 grid gap-6 lg:grid-cols-3">
    <section aria-labelledby="weekly-sales-title" className="rounded-xl border border-border bg-card p-5 sm:p-6 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="weekly-sales-title" className="text-lg font-semibold">Vendas por semana · últimas 13 semanas</h2>
        <p className="text-xs text-muted-foreground"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-middle" />Faturamento concluído <span className="ml-3 mr-1 inline-block h-0.5 w-4 bg-foreground/70 align-middle" />Pedidos recebidos</p>
      </div>
      {hasSales ? <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis yAxisId="revenue" tickFormatter={compactMoney} width={78} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="orders" orientation="right" allowDecimals={false} width={32} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            labelFormatter={label => `Semana de ${label}`}
            formatter={(value, name) => name === "Faturamento" ? [orderMoney(Number(value).toFixed(2)), name] : [value, name]} />
          <Bar yAxisId="revenue" dataKey="revenue" name="Faturamento" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line yAxisId="orders" dataKey="orders" name="Pedidos" type="monotone" stroke="var(--foreground)" strokeOpacity={0.7} strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer></div> : <p className="py-12 text-center text-muted-foreground">Ainda não há vendas nas últimas semanas.</p>}
    </section>
    <section aria-labelledby="top-products-title" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2"><h2 id="top-products-title" className="text-lg font-semibold">Mais vendidos</h2><Link to="/manager/relatorios" className="text-sm text-primary">Relatórios</Link></div>
      {report.topProducts.length ? <ol className="space-y-3">{report.topProducts.map((item, index) => {
        const share = item.quantity / report.topProducts[0].quantity;
        return <li key={item.productName}>
          <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{item.productName}</span><strong className="shrink-0">{item.quantity} un.</strong></div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, share * 100)}%` }} /></div>
        </li>;
      })}</ol> : <p className="text-muted-foreground">Ainda não há produtos vendidos em pedidos concluídos.</p>}
    </section>
  </div>;
}
