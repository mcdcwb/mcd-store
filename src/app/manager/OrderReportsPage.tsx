import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { CalendarRange } from "lucide-react";
import { createManagerApi } from "./api";
import { orderMoney } from "./orders";
import { BUSINESS_TIME_ZONE } from "../../../backend/src/config/business.ts";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type GroupBy = "day" | "week" | "month" | "year";
type Point = { bucket: string; revenue: string; orders: number; previousBucket?: string | null; previousRevenue?: string; previousOrders?: number };
type Summary = { revenue: string; orders: number; averageTicket: string };
type Report = {
  period: { start: string; end: string; groupBy: GroupBy; days: number };
  summary: Summary; series: Point[];
  previous: (Summary & { start: string; end: string }) | null;
  topProducts: { productName: string; quantity: number }[]; lowestProducts: { productName: string; quantity: number }[];
};

// ─── Datas (dias locais da loja, AAAA-MM-DD) ─────────────────────────────────
const DAY_MS = 86_400_000;
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const parseDay = (day: string) => new Date(`${day}T00:00:00Z`);
const formatDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) => formatDay(new Date(parseDay(day).getTime() + days * DAY_MS));
const addMonths = (day: string, months: number) => { const d = parseDay(day); d.setUTCMonth(d.getUTCMonth() + months); return formatDay(d); };
const spanDays = (start: string, end: string) => Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / DAY_MS) + 1;
const validDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDay(value).getTime()) && formatDay(parseDay(value)) === value;

// ─── Filtros ─────────────────────────────────────────────────────────────────
const PRESETS = [
  { id: "7d", label: "7 dias" }, { id: "30d", label: "30 dias" }, { id: "3m", label: "3 meses" }, { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" }, { id: "ano", label: "Este ano" }, { id: "personalizado", label: "Personalizado" },
] as const;
type PresetId = typeof PRESETS[number]["id"];
const DEFAULT_PRESET: PresetId = "6m";
function presetRange(preset: Exclude<PresetId, "personalizado">, today: string) {
  if (preset === "7d") return { start: addDays(today, -6), end: today };
  if (preset === "30d") return { start: addDays(today, -29), end: today };
  if (preset === "ano") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  const months = preset === "3m" ? 3 : preset === "6m" ? 6 : 12;
  return { start: addDays(addMonths(today, -months), 1), end: today };
}
const GROUPS: { id: GroupBy; param: string; label: string }[] = [
  { id: "day", param: "diario", label: "Diário" }, { id: "week", param: "semanal", label: "Semanal" },
  { id: "month", param: "mensal", label: "Mensal" }, { id: "year", param: "anual", label: "Anual" },
];
// Combinações sem sentido ficam desabilitadas (o backend valida as mesmas regras de dia/ano).
function groupUnavailable(group: GroupBy, days: number): string | null {
  if (group === "day" && days > 90) return "Diário só para períodos de até 90 dias.";
  if (group === "week" && days < 14) return "Semanal só para períodos de 14 dias ou mais.";
  if (group === "month" && days < 60) return "Mensal só para períodos de 2 meses ou mais.";
  if (group === "year" && days < 365) return "Anual só para períodos de 1 ano ou mais.";
  return null;
}
// Agrupamento automático: até 31 dias → diário; até ~6 meses → semanal; acima → mensal; mais de 2 anos → anual.
const autoGroup = (days: number): GroupBy => days <= 31 ? "day" : days <= 186 ? "week" : days <= 730 ? "month" : "year";
const MAX_DAYS = 5 * 366;

// ─── Formatação ──────────────────────────────────────────────────────────────
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fullDate = (day: string) => `${shortDate(day)}/${day.slice(0, 4)}`;
function isoWeek(day: string) {
  const d = parseDay(day); const weekday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
function axisLabel(bucket: string, group: GroupBy) {
  if (group === "day") return shortDate(bucket);
  if (group === "week") return `Sem. ${isoWeek(bucket)}`;
  if (group === "month") return `${MONTHS[Number(bucket.slice(5, 7)) - 1]}/${bucket.slice(2, 4)}`;
  return bucket.slice(0, 4);
}
function periodLabel(bucket: string, group: GroupBy) {
  if (group === "day") return fullDate(bucket);
  if (group === "week") return `Semana ${isoWeek(bucket)} · ${shortDate(bucket)} a ${fullDate(addDays(bucket, 6))}`;
  if (group === "month") return `${MONTHS_LONG[Number(bucket.slice(5, 7)) - 1]} de ${bucket.slice(0, 4)}`;
  return bucket.slice(0, 4);
}
const number1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
function compactMoney(value: number) {
  if (value >= 1_000_000) return `R$ ${number1.format(value / 1_000_000)} mi`;
  if (value >= 1000) return `R$ ${number1.format(value / 1000)} mil`;
  return `R$ ${Math.round(value)}`;
}
const money = (value: number | string) => orderMoney((typeof value === "number" ? value : Number(value)).toFixed(2));
// Eixo Y: maior valor + 15%, arredondado para um passo "redondo" (1, 2, 2,5 ou 5 × 10^n), com 4 divisões.
function niceAxis(max: number) {
  if (max <= 0) return { top: 1000, ticks: [0, 250, 500, 750, 1000] };
  const raw = (max * 1.15) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * power).find(candidate => candidate >= raw)!;
  const top = step * Math.ceil((max * 1.15) / step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}
function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? { text: "sem variação vs. período anterior", tone: "neutral" as const } : { text: "sem vendas no período anterior", tone: "neutral" as const };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  return { text: `${rounded > 0 ? "+" : ""}${rounded}% vs. período anterior`, tone: rounded > 0 ? "up" as const : rounded < 0 ? "down" as const : "neutral" as const };
}

// ─── Componentes ─────────────────────────────────────────────────────────────
const segment = (active: boolean, disabled = false) => `min-h-10 shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-card text-foreground shadow-sm ring-1 ring-border" : disabled ? "cursor-not-allowed text-muted-foreground/50" : "text-muted-foreground hover:text-foreground"}`;
function Segmented({ label, children }: { label: string; children: ReactNode }) {
  // Rola na horizontal no mobile em vez de estourar a largura.
  return <div role="group" aria-label={label} className="max-w-full overflow-x-auto [scrollbar-width:thin]">
    <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/50 p-1">{children}</div>
  </div>;
}
function Card({ title, value, delta, to, linkLabel }: { title: string; value: string; delta?: ReturnType<typeof variation> | null; to?: string; linkLabel?: string }) {
  const body = <><h2 className="text-sm text-muted-foreground">{title}</h2><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
    {delta && <p className={`mt-2 text-sm font-medium ${delta.tone === "up" ? "text-emerald-700 dark:text-emerald-400" : delta.tone === "down" ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>{delta.text}</p>}</>;
  return to ? <Link to={to} aria-label={linkLabel} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{body}</Link>
    : <article className="rounded-xl border border-border bg-card p-5">{body}</article>;
}
function ChartTooltip({ active, payload, group, compare }: TooltipProps<number, string> & { group: GroupBy; compare: boolean }) {
  const point = payload?.[0]?.payload as (Point & { revenueValue: number; previousValue: number }) | undefined;
  if (!active || !point) return null;
  return <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
    <p className="font-semibold">{periodLabel(point.bucket, group)}</p>
    <p className="mt-1"><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-primary align-middle" />Faturamento: <strong className="tabular-nums">{money(point.revenueValue)}</strong></p>
    <p className="text-muted-foreground">{point.orders} {point.orders === 1 ? "pedido" : "pedidos"}</p>
    {compare && point.previousBucket && <div className="mt-2 border-t border-border pt-2 text-muted-foreground">
      <p className="text-xs">{periodLabel(point.previousBucket, group)}</p>
      <p><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-primary/35 align-middle" />Faturamento: <strong className="tabular-nums text-foreground">{money(point.previousValue)}</strong></p>
      <p>{point.previousOrders ?? 0} {point.previousOrders === 1 ? "pedido" : "pedidos"}</p>
    </div>}
  </div>;
}
const Skeleton = ({ className }: { className: string }) => <div aria-hidden="true" className={`animate-pulse rounded-lg bg-muted ${className}`} />;

// ─── Página ──────────────────────────────────────────────────────────────────
export function OrderReportsPage({ token, onUnauthorized }: { token: string; onUnauthorized: (message: string) => void }) {
  const api = useMemo(() => createManagerApi(token, import.meta.env.VITE_API_URL || "/api"), [token]);
  const [params, setParams] = useSearchParams();
  const today = todayLocal();

  // Filtros vêm da URL (?periodo=6m&agrupar=semanal&comparar=1 ou ?periodo=personalizado&inicio=…&fim=…).
  const rawPreset = params.get("periodo");
  const customStart = params.get("inicio"), customEnd = params.get("fim");
  const customValid = validDay(customStart) && validDay(customEnd) && customStart <= customEnd && customEnd <= today && spanDays(customStart, customEnd) <= MAX_DAYS;
  const preset: PresetId = rawPreset === "personalizado" ? (customValid ? "personalizado" : DEFAULT_PRESET)
    : PRESETS.some(p => p.id === rawPreset) ? rawPreset as PresetId : DEFAULT_PRESET;
  const range = preset === "personalizado" ? { start: customStart!, end: customEnd! } : presetRange(preset, today);
  const days = spanDays(range.start, range.end);
  const urlGroup = GROUPS.find(g => g.param === params.get("agrupar"))?.id;
  const groupBy: GroupBy = urlGroup && !groupUnavailable(urlGroup, days) ? urlGroup : autoGroup(days);
  const compare = params.get("comparar") === "1";

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value === null ? next.delete(key) : next.set(key, value);
    setParams(next); // entra no histórico: voltar desfaz o último filtro
  };
  const choosePreset = (id: PresetId) => {
    if (id === "personalizado") { setEditingCustom(true); return; }
    setEditingCustom(false);
    // Trocar o período escolhe de novo o agrupamento automático.
    update({ periodo: id === DEFAULT_PRESET ? null : id, inicio: null, fim: null, agrupar: null });
  };

  // Seletor de intervalo (inputs type="date"), aplicado só no "Aplicar".
  const [editingCustom, setEditingCustom] = useState(false);
  const [draft, setDraft] = useState({ start: range.start, end: range.end });
  useEffect(() => { if (!editingCustom) setDraft({ start: range.start, end: range.end }); }, [editingCustom, range.start, range.end]);
  const draftError = !validDay(draft.start) || !validDay(draft.end) ? "Informe as duas datas."
    : draft.start > draft.end ? "A data inicial deve ser anterior ou igual à final."
    : draft.end > today ? "Datas futuras não são permitidas."
    : spanDays(draft.start, draft.end) > MAX_DAYS ? "O período máximo é de 5 anos." : "";
  const showCustom = editingCustom || preset === "personalizado";

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  // Callback do pai numa ref: uma nova referência a cada render não pode refazer a requisição.
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized;
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    api.reports(abort.signal, { start: range.start, end: range.end, groupBy, compare }).then(data => { if (!abort.signal.aborted) { setReport(data); setLoading(false); } })
      .catch(reason => { if (!abort.signal.aborted) { setError(reason.message); setLoading(false); if ([401, 403].includes(reason.status)) unauthorized.current(reason.message); } });
    return () => abort.abort();
  }, [api, range.start, range.end, groupBy, compare, revision]);

  const chart = useMemo(() => report?.series.map(point => ({ ...point, revenueValue: Number(point.revenue), previousValue: Number(point.previousRevenue ?? 0), label: axisLabel(point.bucket, report.period.groupBy) })) ?? [], [report]);
  const axis = niceAxis(Math.max(0, ...chart.map(p => compare ? Math.max(p.revenueValue, p.previousValue) : p.revenueValue)));
  const shown = !loading && report;
  const prev = shown && compare ? report.previous : null;

  return <div className="space-y-6">
    <header><Link className="text-sm text-primary underline" to="/manager">Dashboard</Link><h1 className="mt-2 font-serif text-3xl font-bold">Relatórios</h1>
      <p className="text-muted-foreground">Pedidos finalizados, pela data de conclusão (cancelados e pedidos em andamento não entram). Os valores não representam confirmação de pagamento.</p></header>

    <section aria-label="Filtros do relatório" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Os grupos quebram de linha quando não cabem lado a lado; sozinhos numa linha estreita, rolam na horizontal. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-full"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Período</p>
          <Segmented label="Período">{PRESETS.map(p => { const active = p.id === "personalizado" ? showCustom : !showCustom && preset === p.id;
            return <button key={p.id} type="button" aria-pressed={active} onClick={() => choosePreset(p.id)} className={segment(active)}>{p.label}</button>; })}</Segmented></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 max-w-full"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Agrupar por</p>
            <Segmented label="Agrupar por">{GROUPS.map(g => { const reason = groupUnavailable(g.id, days); const active = groupBy === g.id;
              return <button key={g.id} type="button" aria-pressed={active} aria-disabled={!!reason} title={reason ?? undefined}
                onClick={() => { if (!reason && !active) update({ agrupar: g.param }); }} className={segment(active, !!reason)}>{g.label}</button>; })}</Segmented></div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap pb-1 text-sm">
            <button type="button" role="switch" aria-checked={compare} onClick={() => update({ comparar: compare ? null : "1" })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${compare ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${compare ? "translate-x-5" : ""}`} /></button>
            Comparar com período anterior</label>
        </div>
      </div>
      {showCustom && <form className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={event => { event.preventDefault(); if (draftError) return; setEditingCustom(false); update({ periodo: "personalizado", inicio: draft.start, fim: draft.end, agrupar: null }); }}>
        <label className="flex flex-col gap-1.5 text-sm"><span>Início</span><input type="date" required value={draft.start} max={draft.end && draft.end < today ? draft.end : today}
          onChange={event => setDraft(d => ({ ...d, start: event.target.value }))} className="h-10 rounded-lg border border-border bg-background px-3 tabular-nums" /></label>
        <label className="flex flex-col gap-1.5 text-sm"><span>Fim</span><input type="date" required value={draft.end} min={draft.start || undefined} max={today}
          onChange={event => setDraft(d => ({ ...d, end: event.target.value }))} className="h-10 rounded-lg border border-border bg-background px-3 tabular-nums" /></label>
        <div className="flex gap-2">
          <button type="submit" disabled={!!draftError} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><CalendarRange size={16} aria-hidden="true" />Aplicar</button>
          <button type="button" onClick={() => { setEditingCustom(false); update({ periodo: null, inicio: null, fim: null, agrupar: null }); }} className="min-h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium">Limpar</button>
        </div>
        {draftError && <p role="alert" className="text-sm text-destructive sm:basis-full">{draftError}</p>}
      </form>}
      <p className="text-sm text-muted-foreground" aria-live="polite">{fullDate(range.start)} a {fullDate(range.end)} · {days} {days === 1 ? "dia" : "dias"} · agrupado por {{ day: "dia", week: "semana", month: "mês", year: "ano" }[groupBy]}{compare && report?.previous && shown ? ` · comparando com ${fullDate(report.previous.start)} a ${fullDate(report.previous.end)}` : ""}</p>
    </section>

    {error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-card p-6 text-destructive">{error}<button className="ml-3 underline" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div> : <>
      <section className="grid gap-4 sm:grid-cols-3" aria-busy={loading}>
        {shown ? <>
          <Card title="Faturamento concluído" value={money(report.summary.revenue)} delta={prev && variation(Number(report.summary.revenue), Number(prev.revenue))} />
          <Card title="Pedidos concluídos" value={report.summary.orders.toLocaleString("pt-BR")} delta={prev && variation(report.summary.orders, prev.orders)} to="/manager/pedidos?status=COMPLETED" linkLabel="Ver pedidos concluídos" />
          <Card title="Ticket médio" value={money(report.summary.averageTicket)} delta={prev && variation(Number(report.summary.averageTicket), Number(prev.averageTicket))} />
        </> : [0, 1, 2].map(i => <div key={i} className="rounded-xl border border-border bg-card p-5"><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-7 w-40" /></div>)}
      </section>

      <section aria-labelledby="revenue-chart-title" className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="revenue-chart-title" className="text-lg font-semibold">Faturamento {groupBy === "day" ? "diário" : groupBy === "week" ? "semanal" : groupBy === "month" ? "mensal" : "anual"}</h2>
          {compare && <p className="text-xs text-muted-foreground"><span className="mr-1 inline-block size-2.5 rounded-sm bg-primary align-middle" />Período atual <span className="ml-3 mr-1 inline-block size-2.5 rounded-sm bg-primary/35 align-middle" />Período anterior</p>}
        </div>
        <div className="h-64 w-full sm:h-80 lg:h-[400px]">
          {!shown ? <Skeleton className="h-full w-full" />
            : report.summary.orders === 0 && !(prev && prev.orders) ? <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground"><p className="font-medium text-foreground">Nenhuma venda concluída neste período.</p><p className="text-sm">Experimente um período maior ou outro intervalo de datas.</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis domain={[0, axis.top]} ticks={axis.ticks} tickFormatter={compactMoney} width={74} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip group={report.period.groupBy} compare={compare} />} />
                {compare && <Bar dataKey="previousValue" name="Período anterior" fill="var(--primary)" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={40} />}
                <Bar dataKey="revenueValue" name="Faturamento" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">{([["Mais unidades vendidas", report?.topProducts], ["Menos unidades vendidas", report?.lowestProducts]] as const).map(([title, rows]) =>
        <section key={title} className="rounded-xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2>
          {!shown ? <div className="space-y-3">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div>
            : rows?.length ? <ol className="space-y-3">{rows.map((item, index) => <li key={`${item.productName}-${index}`} className="flex justify-between gap-4 border-b border-border pb-2"><span className="min-w-0 break-words">{item.productName}</span><strong className="shrink-0 tabular-nums">{item.quantity} un.</strong></li>)}</ol>
            : <p className="text-muted-foreground">Nenhum produto vendido em pedidos concluídos neste período.</p>}
        </section>)}</div>
    </>}
  </div>;
}
