import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Info, MessageCircle } from "lucide-react";
import { notify } from "../lib/notifications";
import type { Account } from "../lib/auth";
import { AUTH_STORAGE_KEY } from "../lib/auth-session";
import { accountRequest, type Profile } from "../lib/account";
import { formatCep, type Address } from "../lib/address";
import { whatsappUrl } from "../lib/store-settings";
import type { useStoreDetails } from "../hooks/useStoreDetails";
import type { useShopping } from "../hooks/useShopping";
import {
  CheckoutRequestError, fetchCheckoutReview, moneyFromCents, prepareWhatsapp, readCheckoutMethod, saveCheckoutMethod,
  type CheckoutReview, type FulfillmentMethod
} from "../lib/checkout";
import { ProductImage } from "./ProductImage";

const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

const action = "min-h-11 rounded-sm px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const checkoutEditAction = action + " inline-flex text-primary underline mt-4 pl-0";
const panel = "rounded-none border border-border bg-card p-5 sm:p-7 min-w-0";
function AddressDisplay({ address }: { address: Address }) {
  return <address className="not-italic text-sm leading-6 break-words">{address.street}, {address.number}
    {address.complement && <><br />{address.complement}</>}<br />{address.neighborhood}<br />{address.city} - {address.state}<br />CEP {formatCep(address.cep)}</address>;
}
function validAddress(address: Address | null): address is Address {
  return !!address && /^\d{8}$/.test(address.cep.replace(/\D/g, "")) && [address.street, address.number, address.neighborhood, address.city].every(value => typeof value === "string" && !!value.trim()) && /^[A-Z]{2}$/.test(address.state);
}
export function CheckoutPage({ user, token, validating, shopping, store, cartOpen, onOpenCart, onLogin, onUnauthorized }: {
  user: Account | null; token?: string; validating: boolean; shopping: ReturnType<typeof useShopping>; store: ReturnType<typeof useStoreDetails>;
  cartOpen: boolean; onOpenCart: () => void; onLogin: () => void; onUnauthorized: (message: string) => void;
}) {
  const navigate = useNavigate();
  return <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 min-h-[60vh]">
    <Link to="/" className={action + " inline-flex items-center text-base font-medium text-muted-foreground hover:text-primary cursor-pointer ml-[-10px]"}><ArrowLeft aria-hidden="true" size={20} className="mr-2 text-primary" />Voltar para a loja</Link>
    <h1 className="font-serif text-3xl font-bold mt-5 mb-2">Checkout</h1>
    {validating ? <p role="status">Validando sua conta...</p> : user?.role === "ADMIN" ? <section className={panel + " mt-6"}>
      <h2 className="font-semibold">Checkout exclusivo para clientes</h2><p className="mt-2">Para comprar, saia da conta administrativa e entre com uma conta de cliente.</p>
      <Link className={action + " inline-flex text-primary mt-3"} to="/manager">Ir ao painel administrativo</Link>
    </section> : !user || !token ? <section className={panel + " mt-6"}>
      <p>Entre ou crie uma conta de cliente para continuar. Seu carrinho será preservado.</p>
      <button onClick={onLogin} className={action + " bg-primary text-primary-foreground mt-4"}>Entrar para continuar</button>
    </section> : !shopping.ready || shopping.error ? <section className={panel + " mt-6"}>
      {shopping.error ? <><p role="alert">{shopping.error}</p><button onClick={shopping.retry} className={action + " text-primary underline"}>Tentar sincronizar novamente</button></> : <p role="status">Sincronizando seu carrinho...</p>}
    </section> : <CheckoutReviewPage key={token} user={user} token={token} shopping={shopping} store={store} cartOpen={cartOpen} onOpenCart={onOpenCart} onUnauthorized={onUnauthorized} onOrderOpened={async (orderId) => {
      navigate("/meus-pedidos", { state: { expandedOrderId: orderId } });
      void shopping.clear({ silent: true });
      return true;
    }} />}
  </main>;
}

function CheckoutReviewPage({ user, token, shopping, store, cartOpen, onOpenCart, onUnauthorized, onOrderOpened }: {
  user: Account; token: string; shopping: ReturnType<typeof useShopping>; store: ReturnType<typeof useStoreDetails>;
  cartOpen: boolean; onOpenCart: () => void; onUnauthorized: (message: string) => void; onOrderOpened: (orderId: number) => Promise<boolean>;
}) {
  const [method, setMethod] = useState<FulfillmentMethod | null>(() => readCheckoutMethod(user.id));
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewError, setReviewError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [finalError, setFinalError] = useState("");
  const [revision, setRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [opened, setOpened] = useState(false);
  const attempt = useRef<{ selection: string; key: string } | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const popup = useRef<Window | null>(null);
  const deny = useRef(onUnauthorized); deny.current = onUnauthorized;
  const cartKey = JSON.stringify(shopping.items.map(item => [item.product.id, item.colorId, item.size, item.quantity, item.product.price]));
  const currentSelection = JSON.stringify([cartKey, method, review?.reviewKey, profile?.account.name,
    method === "DELIVERY" ? profile?.address : store.address, store.whatsapp]);
  const live = useRef({ currentSelection, cartOpen, shoppingBusy: shopping.busy });
  live.current = { currentSelection, cartOpen, shoppingBusy: shopping.busy };
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); popup.current?.close(); }; }, []);
  useEffect(() => { saveCheckoutMethod(user.id, method); }, [user.id, method]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setRevision(value => value + 1); };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, []);
  useEffect(() => {
    const request = new AbortController(); let active = true;
    const timer = setTimeout(() => request.abort(), 15000);
    setLoading(true); setReviewError(""); setProfileError("");
    Promise.allSettled([fetchCheckoutReview(token, request.signal), accountRequest<Profile>(token, "GET", undefined, "/conta", request.signal)]).then(([cart, account]) => {
      if (!active) return;
      if (cart.status === "fulfilled") setReview(cart.value);
      else {
        setReviewError(cart.reason instanceof Error && cart.reason.name !== "AbortError" ? cart.reason.message : "Não foi possível conferir o carrinho. Tente novamente.");
        if (cart.reason instanceof CheckoutRequestError && [401, 403].includes(cart.reason.status)) deny.current(cart.reason.message);
      }
      if (account.status === "fulfilled") setProfile(account.value);
      else setProfileError("Não foi possível carregar sua conta e endereço. Tente novamente.");
      setLoading(false);
    }).finally(() => clearTimeout(timer));
    return () => { active = false; request.abort(); clearTimeout(timer); };
  }, [token, revision, cartKey, cartOpen]);
  const accountLink = "/minha-conta?returnTo=/checkout#address-title";
  const canSend = !demoMode && !!method && !!review?.items.length && !review.conflicts.length && !!profile && !loading && !reviewError && !profileError &&
    !store.loading && !store.error && !!whatsappUrl(store.whatsapp) && !shopping.busy && !cartOpen && !sending && !opened &&
    (method === "DELIVERY" ? validAddress(profile.address) : validAddress(store.address));
  async function finalize() {
    if (!canSend || pending.current || !method || !review || !profile) return;
    const sessionIsCurrent = () => {
      try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null")?.accessToken === token; }
      catch { return false; }
    };
    if (!sessionIsCurrent()) { setFinalError("A sessão mudou. Entre novamente para continuar."); return; }
    pending.current = true; setSending(true); setFinalError("");
    const selection = currentSelection;
    if (attempt.current?.selection !== selection) attempt.current = { selection, key: crypto.randomUUID() };
    // Open during the click gesture, before awaiting the server, to avoid popup blockers.
    const tab = window.open("about:blank", "_blank"); popup.current = tab;
    if (!tab) { pending.current = false; setSending(false); setFinalError("Permita abrir uma nova aba para continuar no WhatsApp e tente novamente."); return; }
    tab.opener = null;
    tab.document.title = "Preparando WhatsApp";
    tab.document.body.textContent = "Conferindo seu pedido antes de abrir o WhatsApp...";
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      const prepared = await prepareWhatsapp(token, method, review.reviewKey, {
        customerName: profile.account.name,
        address: method === "DELIVERY" ? profile.address : null, pickupAddress: method === "PICKUP" ? store.address : null,
        whatsapp: store.whatsapp
      }, request.signal, attempt.current!.key);
      if (!alive.current || tab.closed) { tab.close(); return; }
      if (!sessionIsCurrent()) throw new Error("A sessão mudou durante a validação. Entre novamente para continuar.");
      if (live.current.currentSelection !== selection || live.current.cartOpen || live.current.shoppingBusy)
        throw new Error("Os dados do checkout mudaram durante a validação. Confira novamente antes de finalizar.");
      tab.location.replace(prepared.url); popup.current = null;
      setOpened(true);
      notify.positive("Pedido solicitado! Acompanhe o status em Meus Pedidos.");
      await onOrderOpened(prepared.orderId);
    } catch (reason) {
      tab.close(); popup.current = null;
      if (!alive.current) return;
      const message = reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Não foi possível validar o pedido. Tente novamente.";
      setFinalError(message);
      if (reason instanceof CheckoutRequestError) {
        if (reason.review) setReview(reason.review);
        else if (reason.status === 409) { setRevision(value => value + 1); store.reload(); }
        if ([401, 403].includes(reason.status)) deny.current(message);
      }
      notify.error(message);
    } finally { clearTimeout(timeout); controller.current = null; pending.current = false; if (alive.current) setSending(false); }
  }
  return <>
    <p className="text-muted-foreground mb-8">Confira seu pedido. A compra será combinada com a loja pelo WhatsApp.</p>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <section className={panel}>
          <fieldset disabled={sending}>
            <legend className="font-serif text-xl font-bold mb-5">Precisa de entrega?</legend>
            <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${method === "DELIVERY" ? "border-primary" : "border-border"}`}>
              <input className="mt-1 accent-primary focus-visible:outline-2 focus-visible:outline-primary" type="radio" name="fulfillment" checked={method === "DELIVERY"}
                onChange={() => { setMethod("DELIVERY"); setOpened(false); setFinalError(""); }} />
              <span>Sim, preciso de entrega</span>
            </label>
            {method === "DELIVERY" && <div className="py-4 space-y-3" aria-live="polite">
              <h2 className="font-semibold">Endereço de entrega</h2>
              {loading ? <p role="status">Carregando endereço...</p> : profileError ? <p role="alert" className="text-destructive">{profileError}</p> : validAddress(profile?.address ?? null) ?
                <AddressDisplay address={profile!.address!} /> : <p>Você ainda não possui um endereço válido cadastrado. Cadastre um endereço para receber seu pedido.</p>}
              {!profileError && !loading && <Link to={accountLink} className={checkoutEditAction}>{validAddress(profile?.address ?? null) ? "Alterar endereço" : "Cadastrar endereço"}</Link>}
            </div>}
            <label className={`flex items-start gap-3 mt-3 p-4 rounded-lg border cursor-pointer transition-colors ${method === "PICKUP" ? "border-primary" : "border-border"}`}>
              <input className="mt-1 accent-primary focus-visible:outline-2 focus-visible:outline-primary" type="radio" name="fulfillment" checked={method === "PICKUP"}
                onChange={() => { setMethod("PICKUP"); setOpened(false); setFinalError(""); }} />
              <span>Não preciso, irei retirar os produtos na loja</span>
            </label>
            {method === "PICKUP" && <div className="p-4 space-y-3" aria-live="polite">
              <h2 className="font-semibold">Local de retirada</h2>
              {store.loading ? <p role="status">Carregando local de retirada...</p> : store.error ? <p role="alert" className="text-destructive">{store.error}</p> : validAddress(store.address) ?
                <><AddressDisplay address={store.address} /><p className="text-sm text-muted-foreground">Você retirará seu pedido neste endereço.</p></> : <p role="alert">O local de retirada está temporariamente indisponível. Tente novamente mais tarde.</p>}
            </div>}
          </fieldset>
        </section>
        <section className={panel} aria-labelledby="checkout-items-title">
          <h2 id="checkout-items-title" className="font-serif text-xl font-bold">Confira os itens do seu pedido</h2>
          <p className="mt-2 text-sm text-muted-foreground">Verifique se os produtos, cores, tamanhos e quantidades estão corretos antes de finalizar.</p>
          {loading && <p role="status" className="mt-4">Conferindo disponibilidade e preços...</p>}
          {reviewError && <p role="alert" className="text-destructive mt-4">{reviewError}</p>}
          {review && !review.items.length && <p className="mt-5">Seu carrinho está vazio. Adicione peças na loja para continuar.</p>}
          <div className="mt-5 space-y-4">{review?.items.map(item => <article key={item.variantId} aria-label={`${item.product.name}, ${item.product.color.name}, ${item.size}`} className="flex gap-3 sm:gap-4 border border-border rounded-xl p-3 sm:p-4 min-w-0">
            <ProductImage src={item.product.imageUrl} alt={item.product.name} className="w-16 h-20 sm:w-20 sm:h-24 object-cover rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <h3 className="font-semibold">{item.product.name}</h3><p className="text-sm mt-1">Cor: {item.product.color.name} · Tamanho: {item.size}</p>
              <p className="text-sm mt-1">Quantidade: {item.quantity}</p><p className="text-sm text-muted-foreground mt-2">R$ {moneyFromCents(item.unitPriceCents)} cada</p>
              <p className="font-semibold text-primary mt-1">Subtotal: R$ {moneyFromCents(item.subtotalCents)}</p>
            </div>
          </article>)}</div>
          {!!review?.conflicts.length && <div role="alert" className="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive space-y-3">
            {review.conflicts.map(conflict => <p key={conflict.variantId}>{conflict.message}</p>)}
            <button onClick={onOpenCart} className={action + " underline font-medium"}>Revisar no carrinho</button>
          </div>}
          <button onClick={onOpenCart} disabled={sending} className={checkoutEditAction}>Alterar itens no carrinho</button>
        </section>
      </div>
      <aside className={panel + " lg:sticky lg:top-24"} aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title" className="font-serif text-xl font-bold">Valor total dos produtos</h2>
        <p className="text-2xl font-bold text-primary mt-1">{review ? `R$ ${moneyFromCents(review.totalCents)}` : "—"}</p>
        {method === "DELIVERY" && <p className="mt-4 text-sm text-destructive">O valor de entrega será informado e combinado com a loja pelo WhatsApp. Ele não está incluído no total dos produtos.</p>}
        {method === "PICKUP" && <p className="mt-4 text-sm text-muted-foreground">Retirada na loja. Por favor, verifique a disponibilidade pelo WhatsApp.</p>}
        {!method && <p className="mt-4 text-sm">Escolha entrega ou retirada para continuar.</p>}
        {profileError && <p role="alert" className="mt-4 text-sm text-destructive">{profileError}</p>}
        {store.error ? <p role="alert" className="mt-4 text-sm text-destructive">{store.error}</p> : !store.loading && !whatsappUrl(store.whatsapp) && <p role="alert" className="mt-4 text-sm text-destructive">O contato da loja está indisponível nesta demonstração.</p>}
        {finalError && <p role="alert" className="mt-4 text-sm text-destructive">{finalError}</p>}
        <div className="flex justify-center">
          <button onClick={() => { attempt.current = null; setRevision(value => value + 1); store.reload(); setOpened(false); }} disabled={sending || loading} className={action + " text-primary underline text-sm mt-3"}>Conferir dados novamente</button>
        </div>
        {/* O aviso no hover/foco só existe no modo demonstração (o mesmo demoMode que bloqueia canSend). */}
        <div className="group/checkout mt-4">
          <button onClick={finalize} disabled={!canSend} aria-busy={sending} aria-label={sending ? "Validando pedido..." : "Finalizar compra pelo WhatsApp"} className={action + " group w-full bg-primary text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex gap-2 items-center justify-center" + (demoMode ? " group-hover/checkout:bg-destructive group-hover/checkout:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground" : "")}>
            <MessageCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className={"min-w-0 text-center break-words" + (demoMode ? " group-hover/checkout:hidden group-focus-visible:hidden" : "")} aria-hidden="true">{sending ? "Validando pedido..." : "Finalizar compra pelo WhatsApp"}</span>
            {demoMode && <span className="hidden min-w-0 text-center break-words group-hover/checkout:inline group-focus-visible:inline" aria-hidden="true">Checkout desativado no modo de demonstração</span>}
          </button>
        </div>
        {opened && <p role="status" className="text-sm mt-4">WhatsApp aberto em uma nova aba. Volte para esta aba para continuar na loja e acompanhar seu pedido.</p>}
        <p className="text-xs text-muted-foreground mt-4">Abrir o WhatsApp não confirma a venda nem reserva os produtos. O atendimento confirmará disponibilidade, entrega e pagamento.</p>
        {demoMode && (
          <div role="status" className="mt-4 flex min-w-0 items-start gap-3 rounded-md border-2 border-[#111111] bg-[#D9FF38] p-4 text-[#111111]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#111111] text-[#D9FF38]">
              <Info size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 break-words">
              <h3 className="text-sm font-extrabold uppercase tracking-wide">LOJA DEMONSTRATIVA</h3>
              <p className="mt-1 text-sm leading-relaxed">Esta é uma versão de apresentação do projeto.</p>
              <p className="mt-2 text-sm leading-relaxed">O checkout está desativado. Nenhum pedido será enviado pelo WhatsApp.</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  </>;
}
