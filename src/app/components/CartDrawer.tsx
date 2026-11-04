import { useEffect, useRef } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import type { CartItem } from "../hooks/useShopping";
import { ProductImage } from "./ProductImage";
import { formatPrice } from "../lib/presentation";
import { stockFor, type Size } from "../lib/products";

interface AuthUser { id: number; name: string; email: string; role: "USER" | "ADMIN" }

export function CartDrawer({
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
  const drawerRef = useRef<HTMLDivElement>(null);
  // Trap focus, close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 store-backdrop bg-foreground/30 backdrop-blur-sm"
        onClick={(event) => {
          const bounds = drawerRef.current?.getBoundingClientRect();
          if (!bounds) return;
          // Leave at least half the exposed overlay available on narrow screens.
          const safeWidth = Math.min(100, Math.max(0, bounds.left) / 2);
          if (event.clientX < bounds.left - safeWidth) onClose();
        }}
      />

      {/* Drawer */}
      <div ref={drawerRef} className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-serif text-lg font-bold">Seu Carrinho</h2>
            {!user && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Itens salvos localmente.{" "}
                <button onClick={onOpenAuth} className="text-primary underline underline-offset-2 hover:opacity-80">
                  Entre para sincronizar
                </button>
              </p>
            )}
          </div>
          <button aria-label="Fechar carrinho" onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto py-4 px-5 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
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
            items.map((item) => (
              <div
                key={`${item.product.id}-${item.colorId}-${item.size}`}
                className="flex gap-3 p-3 rounded-xl bg-muted/40 border border-border/60"
              >
                {/* Thumb */}
                <div className="w-18 h-20 rounded-lg overflow-hidden bg-muted shrink-0">
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
                      className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      disabled={busy || item.quantity >= stockFor(item.product, item.size)}
                      aria-label="Aumentar quantidade"
                      onClick={() => onChangeQty(item.product.id, item.size, 1, item.colorId)}
                      className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
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
          <div className="border-t border-border px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <button disabled={busy} onClick={onClearCart} className="flex items-center gap-3 py-0 px-0 rounded-x1 border-border text-sm text-destructive font-medium hover:bg-muted transition-colors">
                <Trash2 className="w-4 h-4" />
                Limpar Carrinho
              </button>
            </div>
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
