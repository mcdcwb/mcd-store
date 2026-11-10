import { StoreDetailsForm } from "./StoreDetailsForm";
import { OrdersPage } from "./OrdersPage";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryManagement } from "./CategoryManagement";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router";
import { LayoutDashboard, Package, ClipboardList, ArrowLeft, ArrowUpRight, ArrowRight, LogOut, Settings, ChartNoAxesCombined, UserRound } from "lucide-react";
import { panelAccessOf, type Account } from "../lib/auth";
import { ProductList } from "./ProductList";
import { ProductForm } from "./ProductForm";
import { useManagerProducts } from "./useManagerProducts";
import { productStats } from "./products";
import { useManagerSettings } from "./useManagerSettings";
import { SettingsPage } from "./SettingsPage";
import { createManagerApi } from "./api";
import { OrderStatusPreview } from "./OrderStatusPreview";
import { orderMoney, orderStatusLabels, type OrderStatus } from "./orders";
import { AdminAccountPage } from "./AdminAccountPage";
import { DemoBanner } from "../components/DemoBanner";
import type { DashboardReport } from "./DashboardSales";

const DashboardSales = lazy(() => import("./DashboardSales").then(module => ({ default: module.DashboardSales })));
const OrderReportsPage = lazy(() => import("./OrderReportsPage").then(module => ({ default: module.OrderReportsPage })));

interface Props {
  user: Account | null; token?: string; validating: boolean; sessionError: string | null;
  onLogin: () => void; onLogout: () => void; onUnauthorized: (message: string) => void; onChanged: () => void; onAccountUpdated: (token: string, account: Account) => void;
}
export function Manager(props: Props) {
  if (props.validating) return <main className="min-h-screen bg-background grid place-items-center"><p role="status">Validando sessão...</p></main>;
  // ADMIN: painel completo. Cliente com panelAccess "read-only" (modo demonstração): painel em
  // modo leitura, com a conta dele. Demais (visitante, cliente com o modo desligado): acesso restrito.
  if (!props.user || panelAccessOf(props.user) === "none" || !props.token) return <main className="min-h-screen bg-background flex items-center justify-center p-5">
    <section className="w-full max-w-lg bg-card border border-border rounded-xl p-8 space-y-5">
      <p className="text-sm tracking-widest text-primary">MCD Store · ADMINISTRAÇÃO</p>
      <h1 className="font-serif text-3xl font-bold">{props.user ? "Acesso restrito" : "Acesso administrativo"}</h1>
      <p className="text-muted-foreground">{props.user ? "Esta área é exclusiva para administradores." : "Entre com sua conta de administrador para continuar."}</p>
      {props.sessionError && <p role="alert" className="text-destructive text-sm">{props.sessionError}</p>}
      <div className="flex flex-wrap gap-4 items-center">{!props.user && <button onClick={props.onLogin} className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5">Entrar</button>}<Link to="/" className="inline-flex items-center px-3 py-2.5 text-lg font-medium text-primary underline underline-offset-4"><ArrowLeft aria-hidden="true" size={18} className="mr-2" />Voltar para a loja</Link></div>
    </section>
  </main>;
  return <ManagerWorkspace key={props.token} {...props} user={props.user} token={props.token} />;
}

function ManagerWorkspace({ user, token, onLogout, onUnauthorized, onChanged, onAccountUpdated }: Props & { user: Account; token: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const data = useManagerProducts(token, onUnauthorized, onChanged);
  const path = location.pathname.replace(/\/$/, "");
  // Troca de tela no painel abre no topo. Quem rola é a janela (o <main> não tem overflow próprio).
  // Só a ROTA dispara: ?page=, filtros e ?periodo= mantêm a posição (a paginação tem a própria rolagem).
  // Com BrowserRouter (sem data router / ScrollRestoration), vale para toda troca de rota, inclusive voltar/avançar.
  const mainRef = useRef<HTMLElement | null>(null);
  const firstPath = useRef(true);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (firstPath.current) { firstPath.current = false; return; }
    // Acessibilidade: foco no título da nova tela. Algumas telas trocam o conteúdo enquanto carregam
    // (o h1 é recriado, ex.: "Carregando configurações..."), então por até ~5s o foco é reposto no h1 atual, a menos que o usuário já tenha
    // focado outra coisa.
    let frame = 0, tries = 0;
    const focusTitle = () => {
      const title = mainRef.current?.querySelector<HTMLElement>("h1");
      const active = document.activeElement;
      const free = !active || active === document.body || active.tagName === "H1" || active.closest("aside");
      if (title && free && active !== title) {
        title.tabIndex = -1;
        title.style.outline = "none"; // foco por programação, sem contorno visível
        title.focus({ preventScroll: true });
      }
      if (tries++ < 300 && free) frame = requestAnimationFrame(focusTitle);
    };
    frame = requestAnimationFrame(focusTitle);
    return () => cancelAnimationFrame(frame);
  }, [path]);
  const [storeSaving, setStoreSaving] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const settings = useManagerSettings(token, path, onUnauthorized);
  const orderApi = useMemo(() => createManagerApi(token, import.meta.env.VITE_API_URL || "/api"), [token]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [countError, setCountError] = useState("");
  const [countRevision, setCountRevision] = useState(0);
  const [dashboardStatus, setDashboardStatus] = useState("");
  const [dashboardReport, setDashboardReport] = useState<DashboardReport | null>(null);
  useEffect(() => {
    if (path !== "/manager") return;
    const abort = new AbortController();
    orderApi.statusCounts(abort.signal).then(value => { setCounts(value); setCountError(""); }).catch(error => { if (!abort.signal.aborted) setCountError(error.message); });
    orderApi.reports(abort.signal).then(setDashboardReport).catch(error => { if (!abort.signal.aborted && [401, 403].includes(error.status)) onUnauthorized(error.message); });
    return () => abort.abort();
  }, [orderApi, path, countRevision, onUnauthorized]);
  const edit = /^\/manager\/produtos\/(\d+)\/editar$/.exec(path);
  const isNew = path === "/manager/produtos/novo";
  const product = edit ? data.products.find(item => item.id === Number(edit[1])) : undefined;
  const stats = settings.threshold === null ? null : productStats(data.products, settings.threshold);
  // Modo demonstração: o próprio cliente com leitura do painel (o backend barra as escritas).
  const demo = panelAccessOf(user) === "read-only";
  const navigation = [
    { to: "/manager", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/manager/produtos", label: "Produtos", icon: Package, end: false },
    { to: "/manager/pedidos", label: "Pedidos", icon: ClipboardList, end: true },
    { to: "/manager/relatorios", label: "Relatórios", icon: ChartNoAxesCombined, end: true },
    { to: "/manager/settings", label: "Configurações", icon: Settings, end: true },
    // A conta administrativa não existe para o cliente no modo demonstração (ele usa a Minha Conta da loja).
    ...(demo ? [] : [{ to: "/manager/minha-conta", label: "Minha Conta", icon: UserRound, end: true }])
  ];
  // Faixa fixa do modo demonstração; o menu lateral fixo desce a altura dela (--demo-offset).
  return <div style={{ ["--demo-offset" as string]: demo ? "2.25rem" : "0px" }}>{demo && <DemoBanner sticky />}<div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="lg:sticky lg:top-[var(--demo-offset)] lg:h-[calc(100vh-var(--demo-offset))] bg-card border-b lg:border-b-0 lg:border-r border-border p-5 flex flex-col">
      <div className="mb-5 lg:mb-9"><span className="font-serif text-2xl tracking-[0.2em] text-primary">MCD</span><p className="text-xs tracking-widest text-muted-foreground mt-1">ADMINISTRAÇÃO</p></div>
      <nav aria-label="Navegação administrativa" className="flex flex-wrap lg:flex-col gap-2">
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={event => { if (data.busy || settings.saving || storeSaving || orderSaving) event.preventDefault(); }} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Icon size={18} />{label}</NavLink>)}
        <hr className="w-full border-border my-2 lg:my-5" />
        <Link to="/" onClick={event => { if (data.busy || settings.saving || storeSaving || orderSaving) event.preventDefault(); }} className="flex items-center gap-2 px-3 py-3 text-base font-medium text-muted-foreground hover:text-primary"><ArrowUpRight size={20} />Ver loja</Link>
        <button disabled={data.busy || settings.saving || storeSaving || orderSaving} onClick={onLogout} className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"><LogOut size={18} />Sair</button>
      </nav>
      <div className="mt-5 lg:mt-auto pt-5 border-t border-border text-xs text-muted-foreground break-all"><p className="font-medium text-foreground">{user.name}{demo && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">(demo)</span>}</p><p className="mt-1">{user.email}</p></div>
    </aside>
    <main ref={mainRef} className="min-w-0 w-full max-w-7xl mx-auto p-4 sm:p-8 lg:p-10">
      {path !== "/manager/pedidos" && data.error && <div role="alert" className="mb-5 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg p-4 text-sm"><p>{data.error}</p><button disabled={data.busy} onClick={data.reload} className="underline mt-2">Atualizar lista</button></div>}
      {path === "/manager/pedidos" ? <OrdersPage token={token} onUnauthorized={onUnauthorized} onBusy={setOrderSaving} onConfirmed={() => { data.reload(); onChanged(); setCountRevision(n => n + 1); }} /> : path === "/manager/relatorios" ? <Suspense fallback={<p role="status" className="py-16 text-center text-muted-foreground">Carregando relatórios...</p>}><OrderReportsPage token={token} onUnauthorized={onUnauthorized} /></Suspense> : path === "/manager/minha-conta" ? (demo ? <Navigate to="/minha-conta" replace /> : <AdminAccountPage token={token} user={user} onUpdated={onAccountUpdated} />) : settings.loading ? <p role="status" className="py-20 text-center text-muted-foreground">Carregando configurações...</p> : settings.error || settings.threshold === null || !stats ? <div role="alert" className="rounded-xl border border-destructive/20 bg-card p-6"><p>{settings.error || "Configurações indisponíveis."}</p><button type="button" onClick={settings.reload} className="min-h-11 text-primary underline">Tentar novamente</button></div> : path === "/manager/settings" ? <><SettingsPage settings={settings.settings!} saving={settings.saving || storeSaving} onSave={settings.save} /><StoreDetailsForm disabled={settings.saving || data.busy} token={token} onUnauthorized={onUnauthorized} onBusy={setStoreSaving} />{data.loading ? <p role="status" className="mt-6 text-sm text-muted-foreground">Carregando categorias...</p> : data.loaded && <CategoryManagement settings categories={data.categories} busy={data.busy} onSave={data.saveCategory} onDelete={data.removeCategory} />}</> : data.loading ? <p role="status" className="py-20 text-center text-muted-foreground">Carregando produtos...</p> : data.error && !data.loaded ? null : path === "/manager" ? <>
        <div className="mb-8"><div className="mb-2 flex flex-wrap items-center gap-3"><p className="text-sm text-primary font-medium">VISÃO GERAL</p>{dashboardReport?.hasDemoData && <span title="Pedidos e clientes fictícios gerados para demonstrar o painel" className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Dados demonstrativos</span>}</div><h1 className="font-serif text-3xl font-bold">Dashboard</h1><p className="text-muted-foreground mt-2">Acompanhe a disponibilidade do seu catálogo.</p></div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Faturamento concluído", dashboardReport?.revenue ? orderMoney(dashboardReport.revenue) : "—"], ["Pedidos concluídos", dashboardReport?.completedOrders.toLocaleString("pt-BR") ?? "—"], ["Ticket médio", dashboardReport?.averageTicket ? orderMoney(dashboardReport.averageTicket) : "—"], ["Total de pedidos", dashboardReport?.totalOrders?.toLocaleString("pt-BR") ?? "—"]].map(([label, value]) => <Link key={label} to="/manager/relatorios" className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"><h2 className="text-sm text-muted-foreground">{label}</h2><p className="mt-3 text-2xl font-semibold">{value}</p><span className="mt-2 inline-block text-sm text-primary">Ver relatórios</span></Link>)}</div>{dashboardReport?.weekly && <Suspense fallback={<p role="status" className="mb-6 py-12 text-center text-muted-foreground">Carregando gráficos...</p>}><DashboardSales report={dashboardReport} /></Suspense>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
          { label: "Total de produtos", count: stats.products, to: "/manager/produtos", detail: "Ver catálogo completo" },
          { label: "Total de variantes (cor/tamanho)", count: stats.variants, detail: <><span>{stats.stockedVariants} com estoque</span>{" · "}{stats.emptyVariants > 0 ? <Link to="/manager/produtos?estoque=variante-sem-estoque" aria-label={`Ver ${stats.emptyVariants} variantes sem estoque`} onClick={event => { if (data.busy || settings.saving || storeSaving || orderSaving) event.preventDefault(); }} className="inline-block py-1 text-primary underline decoration-primary/40 underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">{stats.emptyVariants} sem estoque</Link> : <span>0 sem estoque</span>}</> },
          { label: "Produtos sem estoque", count: stats.empty, to: "/manager/produtos?estoque=sem-estoque", arrow: true },
          { label: "Variantes com estoque baixo", count: stats.lowVariants, to: "/manager/produtos?estoque=variante-baixo", arrow: true, variant: true }
        ].map(({ label, count, to, detail, arrow, variant }) => {
          const content = <><h2 className="text-sm text-muted-foreground">{label}</h2><p className="text-4xl font-semibold mt-4">{count}</p>
            <p className={`mt-3 text-sm ${to ? "text-primary" : "text-muted-foreground"}`}>{arrow ? <span className="inline-flex items-center gap-1.5">{variant ? "Ver variantes" : "Ver produtos"} <ArrowRight aria-hidden="true" size={15} className="transition-transform duration-200 motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1 motion-reduce:transform-none motion-reduce:translate-none motion-reduce:transition-none" /></span> : detail}</p></>;
          const base = "bg-card border border-border rounded-xl p-6 transition-[translate,box-shadow,border-color] duration-200 motion-reduce:transition-none";
          return to ? <Link key={label} to={to} onClick={event => { if (data.busy || settings.saving || storeSaving || orderSaving) event.preventDefault(); }} className={`${base} group block cursor-pointer motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 motion-safe:focus-visible:-translate-y-0.5 focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none motion-reduce:translate-none`}>{content}</Link>
            : <section key={label} aria-label={label} className={`${base} hover:border-primary/20 hover:shadow-sm`}>{content}</section>;
        })}</div>
        <section aria-labelledby="order-status-title" className="mt-6 bg-card border border-border rounded-xl p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="order-status-title" className="text-lg font-semibold">Pedidos por status</h2><label className="text-sm">Filtrar pedidos <select aria-label="Filtrar pedidos por status" className="ml-2 min-h-10 rounded-md border border-border bg-background px-3" value={dashboardStatus} onChange={event => setDashboardStatus(event.target.value)}><option value="">Todos</option>{Object.entries(orderStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label></div>{countError ? <div role="alert" className="mt-4 text-destructive">{countError}<button className="ml-3 underline" onClick={() => setCountRevision(n => n + 1)}>Tentar novamente</button></div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{(Object.keys(orderStatusLabels) as OrderStatus[]).map(status => <Link key={status} to={`/manager/pedidos?status=${status}`} aria-label={`Ver pedidos: ${orderStatusLabels[status]}`} className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="block text-xs text-muted-foreground">{orderStatusLabels[status]}</span><strong className="mt-1 block text-2xl">{counts?.[status] ?? "—"}</strong></Link>)}</div>}<OrderStatusPreview api={orderApi} status={dashboardStatus} onUnauthorized={onUnauthorized} /></section><section className="mt-6 bg-card border border-border rounded-xl p-6 sm:p-8"><h2 className="text-lg font-semibold">Seu catálogo, em dia</h2><p className="text-muted-foreground text-sm mt-2">O estoque de cada produto é a soma de suas variantes. Variantes com estoque baixo: de 1 a {settings.threshold} unidades.</p><Link to="/manager/produtos" className="inline-flex mt-5 text-primary font-semibold items-center gap-2">Gerenciar produtos <ArrowUpRight size={18} /></Link></section>
      </> : path === "/manager/produtos" ? <ProductList categories={data.categories} threshold={settings.threshold} products={data.products} busy={data.busy} error={data.error} onDelete={data.remove} onCarousel={data.setCarousel} onCarouselOrder={data.setCarouselOrder} /> : isNew || (edit && product) ? <>
        <h1 className="font-serif text-3xl font-bold mb-2">{isNew ? "Novo produto" : "Editar produto"}</h1><p className="text-muted-foreground mb-6">{isNew ? "Adicione uma nova peça ao catálogo." : product?.name}</p>
        <ProductForm categories={data.categories} onSaveCategory={data.saveCategory} key={product?.id ?? "new"} product={product} busy={data.busy} onUpload={data.upload} onCancel={() => navigate("/manager/produtos")} onSave={async input => { if (await data.save(input, product?.id)) navigate("/manager/produtos"); }} />
      </> : <section className="p-8 bg-card border border-border rounded-xl"><h1 className="text-xl font-semibold">{edit ? "Produto não encontrado" : "Página não encontrada"}</h1><Link to="/manager/produtos" className="inline-block mt-4 text-primary underline">Voltar para produtos</Link></section>}
    </main>
  </div></div>;
}
