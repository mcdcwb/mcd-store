import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { lockScroll } from "../lib/scrollLock";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import type { CartItem } from "../hooks/useShopping";
import { ProductImage } from "./ProductImage";
import { formatPrice } from "../lib/presentation";
import { stockFor, type Size } from "../lib/products";


// ─── Animação do carrinho (ajuste aqui) ──────────────────────────────────────
// Abertura ~0,6s: fundo escurece, duas camadas atravessam da direita, o painel entra logo atrás e o
// conteúdo aparece em sequência. Fechamento ~0,35s: o caminho inverso, mais rápido.
const OPEN = { overlay: 0.25, layer: 0.32, layerStagger: 0.07, panelDelay: 0.12, panel: 0.4, contentDelay: 0.3, content: 0.22, contentStagger: 0.05 };
const CLOSE = { content: 0.1, panelDelay: 0.04, panel: 0.22, layerDelay: 0.1, layer: 0.2, layerStagger: 0.04, overlayDelay: 0.12, overlay: 0.2 };
const REDUCED_MOTION_FADE = 0.12; // com prefers-reduced-motion: só um fade rápido
const CONTENT_OFFSET_Y = 12;      // px que o conteúdo sobe ao aparecer
const MAX_STAGGERED_ITEMS = 6;    // só os primeiros itens entram em sequência
const PRELAYER_COLORS = ["var(--primary)", "var(--muted)"];

interface AuthUser { id: number; name: string; email: string; role: "USER" | "ADMIN" }

export function CartDrawer({
  open,
  busy,
  items,
  totalPrice,
  user,
  onClose,
  onRemove,
  onChangeQty,
  onClearCart,
  onOpenAuth,
  onCheckout,
  onExplore,
}: {
  open: boolean;
  busy: boolean;
  items: CartItem[];
  totalPrice: number;
  user: AuthUser | null;
  onClose: () => void;
  onRemove: (id: number, size: Size, colorId: number) => void;
  onChangeQty: (id: number, size: Size, delta: number, colorId: number) => void;
  onOpenAuth: () => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onExplore: () => void;
}) {
  const [rendered, setRendered] = useState(open);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const layersRef = useRef<(HTMLDivElement | null)[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const initializedRef = useRef(false);

  if (open && !rendered) setRendered(true);

  // Monta escondido (antes da pintura) e anima abrir/fechar. Cada mudança mata a timeline anterior,
  // e as animações partem do estado atual, então abrir e fechar rápido não quebra nada.
  useLayoutEffect(() => {
    const overlay = overlayRef.current, panel = drawerRef.current;
    if (!rendered || !overlay || !panel) return;
    const layers = layersRef.current.filter((layer): layer is HTMLDivElement => Boolean(layer));
    const content = Array.from(panel.querySelectorAll<HTMLElement>("[data-cart-stagger]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timelineRef.current?.kill();
    if (!initializedRef.current) {
      initializedRef.current = true;
      gsap.set(overlay, { opacity: 0 });
      if (reduced) { gsap.set(panel, { opacity: 0 }); gsap.set(layers, { autoAlpha: 0 }); }
      else { gsap.set([...layers, panel], { xPercent: 100 }); gsap.set(content, { opacity: 0, y: CONTENT_OFFSET_Y }); }
    }
    const tl = gsap.timeline();
    timelineRef.current = tl;
    if (open) {
      overlay.style.pointerEvents = panel.style.pointerEvents = "";
      if (!panel.contains(document.activeElement)) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        closeButtonRef.current?.focus({ preventScroll: true });
      }
      if (reduced) tl.to([overlay, panel], { opacity: 1, duration: REDUCED_MOTION_FADE });
      else tl.to(overlay, { opacity: 1, duration: OPEN.overlay, ease: "power1.out" }, 0)
        .to(layers, { xPercent: 0, duration: OPEN.layer, stagger: OPEN.layerStagger, ease: "power4.out" }, 0)
        .to(panel, { xPercent: 0, duration: OPEN.panel, ease: "power4.out" }, OPEN.panelDelay)
        .to(content, { opacity: 1, y: 0, duration: OPEN.content, stagger: OPEN.contentStagger, ease: "power2.out" }, OPEN.contentDelay);
    } else {
      // Fechando: deixa de bloquear cliques e devolve o foco já (ao botão que abriu ou ao do header).
      overlay.style.pointerEvents = panel.style.pointerEvents = "none";
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : document.querySelector<HTMLElement>('[aria-label="Abrir carrinho"]');
        target?.focus({ preventScroll: true });
      }
      tl.eventCallback("onComplete", () => { initializedRef.current = false; setRendered(false); });
      if (reduced) tl.to([overlay, panel], { opacity: 0, duration: REDUCED_MOTION_FADE });
      else tl.to(content, { opacity: 0, duration: CLOSE.content, ease: "power1.in" }, 0)
        .to(panel, { xPercent: 100, duration: CLOSE.panel, ease: "power3.in" }, CLOSE.panelDelay)
        .to([...layers].reverse(), { xPercent: 100, duration: CLOSE.layer, stagger: CLOSE.layerStagger, ease: "power3.in" }, CLOSE.layerDelay)
        .to(overlay, { opacity: 0, duration: CLOSE.overlay, ease: "power1.in" }, CLOSE.overlayDelay);
    }
  }, [open, rendered]);

  useEffect(() => () => { timelineRef.current?.kill(); }, []);

  // ESC fecha; a rolagem da página fica travada enquanto o carrinho está na tela.
  useEffect(() => {
    if (!rendered) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open, rendered]);
  useEffect(() => (rendered ? lockScroll() : undefined), [rendered]);

  if (!rendered) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 store-backdrop bg-foreground/30 backdrop-blur-sm"
        onClick={(event) => {
          const bounds = drawerRef.current?.getBoundingClientRect();
          if (!bounds) return;
          // Leave at least half the exposed overlay available on narrow screens.
          const safeWidth = Math.min(100, Math.max(0, bounds.left) / 2);
          if (event.clientX < bounds.left - safeWidth) onClose();
        }}
      />

      {/* Camadas que atravessam antes do painel (só decoração) */}
      {PRELAYER_COLORS.map((color, index) => (
        <div key={color} ref={el => { layersRef.current[index] = el; }} aria-hidden="true"
          className="pointer-events-none fixed inset-y-0 right-0 z-50 w-full max-w-md" style={{ background: color }} />
      ))}

      {/* Drawer */}
      <div ref={drawerRef} className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div data-cart-stagger className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-4 font-bold"><ShoppingCart aria-hidden="true" className="h-5 w-5" />Seu Carrinho</h2>
            <button ref={closeButtonRef} aria-label="Fechar carrinho" onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {!user && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span>Itens salvos localmente</span>
              <button onClick={onOpenAuth} className="mx-auto mt-2 block w-fit rounded-lg border border-border px-3 py-2 text-primary transition-colors hover:bg-primary/10">
                Entre para sincronizar
              </button>
            </p>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto py-4 px-5 space-y-4">
          {items.length === 0 ? (
            <div data-cart-stagger className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <ShoppingCart className="w-9 h-9 opacity-40" />
              </div>
              <div className="text-center">
                <p className="font-medium">Carrinho vazio</p>
                <p className="text-sm mt-1">Adicione peças para começar</p>
              </div>
              <button
                onClick={onExplore}
                className="mt-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
              >
                Explorar peças
              </button>
            </div>
          ) : (
            items.map((item, index) => (
              <div
                data-cart-stagger={index < MAX_STAGGERED_ITEMS ? "" : undefined}
                key={`${item.product.id}-${item.colorId}-${item.size}`}
                className="flex gap-3 p-3 rounded-none bg-muted/50 border border-border/60"
              >
                {/* Thumb */}
                <div className="w-20 h-24 rounded-sm overflow-hidden bg-muted shrink-0">
                  <ProductImage
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cor: <span className="font-semibold text-foreground">{item.product.color.name}</span>{" · "}Tamanho: <span className="font-semibold text-foreground">{item.size}</span>
                  </p>
                  <p className="text-sm font-bold text-primary">{formatPrice(item.product.price)}</p>
                  {item.quantity > stockFor(item.product, item.size) && <p className="text-xs text-destructive">Disponíveis: {stockFor(item.product, item.size)}. Revise a quantidade ou remova este item.</p>}
                  {/* Qty controls */}
                  <div className="flex items-center gap-2 mt-auto">
                    <button
                      disabled={busy}
                      aria-label="Diminuir quantidade"
                      title={item.quantity > stockFor(item.product, item.size) ? `Ajustar para ${stockFor(item.product, item.size)} unidades disponíveis` : undefined}
                      onClick={() => onChangeQty(item.product.id, item.size, -1, item.colorId)}
                      className="w-7 h-7 rounded-sm border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      disabled={busy || item.quantity >= stockFor(item.product, item.size)}
                      aria-label="Aumentar quantidade"
                      onClick={() => onChangeQty(item.product.id, item.size, 1, item.colorId)}
                      className="w-7 h-7 rounded-sm border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={busy}
                      aria-label="Remover item"
                      onClick={() => onRemove(item.product.id, item.size, item.colorId)}
                      className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div data-cart-stagger className="border-t border-border px-5 py-3 space-y-3">
            <div className="flex items-center justify-center">
              <button
                disabled={busy}
                onClick={onClearCart}
                className="flex w-full items-center justify-center gap-3 py-3 rounded-none text-sm text-destructive font-medium hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Limpar Carrinho
              </button>
            </div>
            <div className="-mx-5 border-t border-border"></div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="font-bold text-lg text-foreground">{formatPrice(totalPrice)}</span>
            </div>
            <button disabled={busy} onClick={onCheckout} className="w-full py-3 rounded-none bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              Finalizar compra
            </button>
            {!user && (
              <button
                onClick={onOpenAuth}
                className="w-full py-2.5 rounded-none border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Entrar para salvar carrinho
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
