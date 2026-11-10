import { useEffect, useRef, useState } from "react";
import { useAddFeedback } from "./useAddFeedback";
import { useFavoriteFeedback } from "./useFavoriteFeedback";
import { notify } from "../lib/notifications";
import { adaptProduct, selectProductColor, stockFor, type Product } from "../lib/products";
import type { Account } from "../lib/auth";
import { AUTH_STORAGE_KEY } from "../lib/auth-session";
import { announceDemoBlock } from "../lib/demo";

export interface CartItem { product: Product; colorId: number; size: string; quantity: number }
// Favorito = combinação produto + cor + tamanho. `product` já vem com a cor salva aplicada
// (ou a primeira cor, em favoritos antigos sem cor). colorId/size null = não escolhido.
export interface FavoriteItem { id: number; product: Product; colorId: number | null; size: string | null }
export const favoriteKey = (productId: number, colorId: number | null, size: string | null) => `${productId}:${colorId ?? ""}:${size ?? ""}`;
const sameFavorite = (a: Pick<FavoriteItem, "colorId" | "size"> & { product: { id: number } }, productId: number, colorId: number | null, size: string | null) =>
  a.product.id === productId && a.colorId === colorId && a.size === size;
type RawFavorite = { id: number; product: unknown; colorId: number | null; size: string | null };
function adaptFavorites(rows: RawFavorite[]): FavoriteItem[] {
  return rows.map(row => {
    const base = adaptProduct(row.product);
    const colorId = typeof row.colorId === "number" && base.colors.some(c => c.id === row.colorId) ? row.colorId : null;
    return { id: row.id, product: colorId === null ? base : selectProductColor(base, colorId), colorId, size: typeof row.size === "string" ? row.size : null };
  });
}
// v1 mixed administrator and visitor items: never guess their owner on upgrade.
const key = "brecho_guest_cart_v2";
const pendingPrefix = "brecho_guest_pending_v2:";
const shoppingChangeKey = "mcd-store_shopping_change_v1";
function readGuest(storageKey = key): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter(i => Number.isSafeInteger(i?.product?.id) && typeof i.size === "string" && Number.isSafeInteger(i.quantity) && i.quantity > 0) : [];
  } catch { return []; }
}
function saveGuest(items: CartItem[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* Guest cart still works in memory. */ }
}
export function useShopping(products: Product[], accessToken: string | undefined, validating: boolean, user: Account | null, reviewing = false, onOpenCart?: () => void) {
  const favoriteToken = user ? accessToken : undefined;
  const token = user?.role === "USER" ? accessToken : undefined;
  const owner = user ? `${user.role}:${user.id}` : "guest";
  const additions = useAddFeedback(`${owner}:${accessToken ?? ""}`);
  const favoriteFeedback = useFavoriteFeedback(`${owner}:${accessToken ?? ""}`);
  const addQueue = useRef(Promise.resolve());
  useEffect(() => { addQueue.current = Promise.resolve(); }, [owner, accessToken]);
  // Trigger renders on local/storage changes, but read the shared snapshot below
  // so an undelivered storage event cannot resurrect an already imported cart.
  const [, setGuest] = useState<CartItem[]>([]);
  const [adminCart, setAdminCart] = useState<{ owner: string; token: string | undefined; items: CartItem[] } | null>(null);
  const [account, setAccount] = useState<{ token: string; items: CartItem[]; favorites: FavoriteItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const locked = useRef(false);
  const identity = useRef(accessToken);
  identity.current = accessToken;
  useEffect(() => { setAdminCart(null); }, [accessToken, owner]);
  function isCurrent() {
    if (identity.current !== accessToken || validating) return false;
    try { return (JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null")?.accessToken) === accessToken; }
    catch { return false; }
  }
  function announce() {
    try { localStorage.setItem(shoppingChangeKey, crypto.randomUUID()); } catch { /* No cross-tab storage. */ }
  }
  useEffect(() => {
    const refresh = (event?: StorageEvent) => {
      if (event && event.storageArea !== localStorage) return;
      if (!event || event.key === key || event.key === null) setGuest(readGuest());
      if (!event || event.key === shoppingChangeKey || event.key === null) setRevision(v => v + 1);
    };
    const focus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", focus); };
  }, []);
  async function request(path: string, method = "GET", body?: unknown) {
    if (!isCurrent()) throw new Error("A sessão mudou. Aguarde a atualização da conta.");
    if (reviewing && method !== "GET" && path.startsWith("/carrinho") && path !== "/carrinho/sincronizar") path += "?conferencia=1";
    const response = await fetch((import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") + path, {
      method, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${path.startsWith("/favoritos") ? favoriteToken : token}` },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => { throw new Error("Resposta inválida do servidor. Tente novamente."); });
    if (!response.ok) throw new Error(data.error || "Não foi possível sincronizar. Tente novamente.");
    return data;
  }
  const adaptCart = (data: { items: CartItem[] }) => data.items.map(i => ({ ...i, product: selectProductColor(adaptProduct(i.product), i.colorId) }));
  useEffect(() => {
    const current = ++generation.current;
    locked.current = false;
    setAccount(previous => reviewing && previous?.token === favoriteToken ? previous : null);
    setError("");
    setNotice("");
    setBusy(false);
    if (!favoriteToken || validating) return;
    locked.current = Boolean(token);
    setBusy(Boolean(token));
    void (async () => {
      try {
        // A shared lock and persistent owner claim prevent two identities from
        // importing the same guest cart, including after a failed/late request.
        const loadCart = async () => {
          if (current !== generation.current || !isCurrent()) return null;
          const pendingKey = pendingPrefix + owner;
          const pendingGuest = [...readGuest(pendingKey), ...readGuest()];
          if (!pendingGuest.length) return null;
          // Move the snapshot to this verified identity before any network I/O.
          // Failures remain retryable only by this USER; a new visitor can start
          // a fresh cart without inheriting or modifying the pending snapshot.
          localStorage.setItem(pendingKey, JSON.stringify(pendingGuest));
          localStorage.setItem(key, "[]");
          setGuest([]);
          const cart = await request("/carrinho/sincronizar", "POST", { items: pendingGuest.map(i => ({ productId: i.product.id, colorId: i.colorId, size: i.size, quantity: i.quantity })) });
          // Consume a confirmed merge even if its account logged out meanwhile.
          localStorage.removeItem(pendingKey);
          return { ...cart, notices: ["Carrinho de visitante sincronizado: itens iguais mantêm a maior quantidade, limitada ao estoque.", ...cart.notices] };
        };
        const loadAccountCart = async () => {
          let merged = null;
          if (readGuest().length || readGuest(pendingPrefix + owner).length) {
            if (!navigator.locks) throw new Error("Para sincronizar o carrinho entre abas, use um navegador atualizado e uma conexão HTTPS.");
            merged = await navigator.locks.request("mcd-store-guest-merge", loadCart);
          }
          if (current !== generation.current || !isCurrent()) return null;
          // Ordinary account reads must not hold the cross-tab guest lock.
          return merged ?? request(reviewing ? "/carrinho/conferencia" : "/carrinho");
        };
        const [cart, favorites] = await Promise.all([
          token ? loadAccountCart() : Promise.resolve({ items: [], notices: [] }),
          request("/favoritos")
        ]);
        if (!cart || current !== generation.current || !isCurrent()) return;
        setAccount({ token: favoriteToken, items: adaptCart(cart), favorites: adaptFavorites(favorites) });
        setNotice(cart.notices.join(" "));
      } catch (e) {
        if (current === generation.current) setError(e instanceof Error ? e.message : "Falha ao carregar seus dados.");
      } finally {
        if (current === generation.current) { locked.current = false; setBusy(false); }
      }
    })();
    return () => { generation.current++; };
  }, [accessToken, owner, validating, revision, reviewing]);

  const localItems = user && user.role !== "USER" ? adminCart?.owner === owner && adminCart.token === accessToken ? adminCart.items : [] : readGuest();
  const guestItems = localItems.reduce<CartItem[]>((items, item) => {
    const base = products.find(p => p.id === item.product.id);
    if (!base) return items;
    const colorId = item.colorId ?? base.colors[0].id;
    if (!base.colors.some(c => c.id === colorId)) return items;
    const product = selectProductColor(base, colorId);
    const previous = items.find(i => i.product.id === product.id && i.colorId === colorId && i.size === item.size);
    const quantity = Math.min(stockFor(product, item.size), (previous?.quantity ?? 0) + item.quantity);
    if (previous) previous.quantity = quantity;
    else if (quantity > 0) items.push({ product, colorId, size: item.size, quantity });
    return items;
  }, []);
  const ready = !validating && isCurrent() && (!token || account?.token === token);
  const favoriteReady = !validating && isCurrent() && (!favoriteToken || account?.token === favoriteToken);
  const items = !ready ? [] : token ? account?.token === token ? account.items : [] : guestItems;
  const cartSnapshot = useRef(items);
  cartSnapshot.current = items;
  const favorites = favoriteReady && favoriteToken && account?.token === favoriteToken
    ? account.favorites.filter(favorite => favorite.product.isPublished && products.some(current => current.id === favorite.product.id && current.isPublished)) : [];
  useEffect(() => {
    if (!user && !validating && products.length && isCurrent()) {
      setGuest(guestItems);
      saveGuest(guestItems);
    }
  }, [products, accessToken, validating]);
  async function mutate(path: string, method: string, body?: unknown, onCartConfirmed?: (items: CartItem[]) => void) {
    if (!token || !ready || locked.current || !isCurrent()) return false;
    const current = generation.current;
    locked.current = true;
    setBusy(true); setError("");
    try {
      const result = await request(path, method, body);
      if (current !== generation.current || !isCurrent()) return false;
      const update = path.startsWith("/favoritos")
        ? { favorites: adaptFavorites(result) }
        : { items: adaptCart(result) };
      if (update.items) cartSnapshot.current = update.items;
      setAccount(previous => previous && ({ ...previous, ...update }));
      if (result.notices?.length) setNotice(result.notices.join(" "));
      announce();
      if (update.items) onCartConfirmed?.(update.items);
      return true;
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }
  function updateGuest(next: CartItem[]) {
    if (!isCurrent()) return;
    cartSnapshot.current = next;
    if (user && user.role !== "USER") { setAdminCart({ owner, token: accessToken, items: next }); return; }
    setGuest(next); saveGuest(next);
  }
  async function add(product: Product, size: string) {
    if (!ready || !isCurrent() || !product.isPublished || !products.some(current => current.id === product.id && current.isPublished)) return false;
    const current = generation.current;
    return additions.run(product, size, () => {
      const operation = addQueue.current.then(async () => {
        if (current !== generation.current || !isCurrent() || locked.current) return false;
        const matches = (item: CartItem) => item.product.id === product.id && item.colorId === product.colorId && item.size === size;
        const snapshot = cartSnapshot.current;
        const previous = snapshot.find(matches);
        let changed = false;
        if (token) {
          await mutate("/carrinho", "POST", { productId: product.id, colorId: product.colorId, size, quantity: 1 }, confirmed => {
            changed = (confirmed.find(matches)?.quantity ?? 0) > (previous?.quantity ?? 0);
          });
        } else {
          if ((previous?.quantity ?? 0) >= stockFor(product, size)) return false;
          updateGuest(previous ? snapshot.map(i => i === previous ? { ...i, quantity: i.quantity + 1 } : i) : [...snapshot, { product, colorId: product.colorId, size, quantity: 1 }]);
          changed = true;
        }
        if (changed) notify.positive(`${product.name} — tamanho ${size} foi adicionado ao carrinho.`, onOpenCart ? { label: "Ver no Carrinho", onClick: onOpenCart } : undefined);
        return changed;
      });
      // Serialize server snapshots without discarding another variant's click.
      addQueue.current = operation.then(() => undefined, () => undefined);
      return operation;
    });
  }
  async function remove(productId: number, size: string, colorId: number) {
    if (!ready || locked.current) return;
    const item = items.find(i => i.product.id === productId && i.colorId === colorId && i.size === size);
    if (!item) return;
    if (token) {
      if (!await mutate("/carrinho/item", "DELETE", { productId, colorId, size })) return;
    } else updateGuest(guestItems.filter(i => i.product.id !== productId || i.colorId !== colorId || i.size !== size));
    notify.removal(`${item.product.name} — tamanho ${size} foi removido do carrinho.`);
  }
  async function changeQty(productId: number, size: string, delta: number, colorId: number) {
    if (!ready || locked.current) return;
    const item = items.find(i => i.product.id === productId && i.colorId === colorId && i.size === size);
    if (!item) return;
    const quantity = reviewing && delta < 0 ? Math.min(item.quantity + delta, stockFor(item.product, size)) : item.quantity + delta;
    if (quantity <= 0) return remove(productId, size, colorId);
    const reportQuantity = (confirmed: number) => {
      if (delta > 0 ? confirmed <= item.quantity : confirmed >= item.quantity) return;
      const message = `${item.product.name} — tamanho ${size}: quantidade ${confirmed}.`;
      if (confirmed > item.quantity) notify.positive(message);
      else notify.change(message);
    };
    if (token) {
      await mutate("/carrinho", "PATCH", { productId, colorId, size, quantity }, confirmed => {
        const updated = confirmed.find(i => i.product.id === productId && i.colorId === colorId && i.size === size);
        if (updated && updated.quantity >= 1) reportQuantity(updated.quantity);
      });
      return;
    }
    const confirmed = Math.min(stockFor(item.product, size), quantity);
    if (confirmed < 1 || confirmed === item.quantity || !isCurrent()) return;
    updateGuest(guestItems.map(i => i === item ? { ...i, quantity: confirmed } : i));
    reportQuantity(confirmed);
  }
  async function clear(options: { silent?: boolean } = {}) {
    if (!items.length) return true;
    if (!ready || locked.current) return false;
    if (token) {
      if (!await mutate("/carrinho", "DELETE")) return false;
    } else updateGuest([]);
    if (!options.silent) notify.removal("Carrinho esvaziado com sucesso.");
    return true;
  }
  const isFavorite = (productId: number, colorId: number | null, size: string | null) => favorites.some(f => sameFavorite(f, productId, colorId, size));
  async function toggleFavorite(productId: number, colorId: number | null, size: string | null) {
    // Favoritos gravam no banco: no modo demonstração só mostram o aviso.
    if (user?.role === "DEMO") { announceDemoBlock(); return false; }
    if (!favoriteToken || !favoriteReady || !isCurrent()) return false;
    return favoriteFeedback.run(favoriteKey(productId, colorId, size), async () => {
      const current = generation.current;
      const removing = isFavorite(productId, colorId, size);
      setError("");
      try {
        const result = await request("/favoritos", removing ? "DELETE" : "POST", { productId, colorId, size });
        if (current !== generation.current || !isCurrent()) return false;
        const confirmed = adaptFavorites(result).find(f => sameFavorite(f, productId, colorId, size));
        // Merge only this combination: independent requests can return snapshots out of order.
        setAccount(previous => previous?.token === favoriteToken ? {
          ...previous, favorites: [
            ...previous.favorites.filter(f => !sameFavorite(f, productId, colorId, size)), ...(confirmed ? [confirmed] : [])
          ].sort((a, b) => a.id - b.id)
        } : previous);
        announce();
        if (removing) notify.removal("Produto removido dos favoritos!");
        else notify.positive("Produto adicionado aos favoritos!");
        return true;
      } catch (e) {
        if (current === generation.current && isCurrent()) setError(e instanceof Error ? e.message : "Falha ao salvar.");
        return false;
      }
    });
  }
  return {
    items, favorites, busy, ready, favoriteReady, error, notice, favoriteBlocked: favoriteFeedback.blocked, favoriteState: favoriteFeedback.state, addState: additions.getState, add, remove, changeQty, clear,
    dismissNotice: () => setNotice(""),
    retry: () => setRevision(v => v + 1),
    toggleFavorite, isFavorite
  };
}
