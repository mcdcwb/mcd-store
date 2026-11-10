import type { MouseEvent } from "react";
import type { GetAddState } from "../hooks/useAddFeedback";
import type { FavoriteItem } from "../hooks/useShopping";
import { formatPrice } from "../lib/presentation";
import { selectProductColor, stockFor, type Product, type Size } from "../lib/products";
import { ProductFavoriteButton } from "./ProductFavoriteButton";
import { ProductImage } from "./ProductImage";
import type { FavoriteControls } from "./ProductViews";

// Link do produto já com a cor e o tamanho salvos pré-selecionados.
export function favoriteHref({ product, colorId, size }: FavoriteItem) {
  const params = new URLSearchParams({ productId: String(product.id) });
  if (colorId !== null) params.set("colorId", String(colorId));
  if (size !== null) params.set("tamanho", size);
  return `/?${params}`;
}

export function FavoriteCard({ item, catalog, favorite, onOpen, onAddToCart, addState, availableStock }: {
  item: FavoriteItem;
  /** Produto atual do catálogo (estoque e variantes ao vivo); undefined se saiu do catálogo. */
  catalog: Product | undefined;
  favorite: FavoriteControls;
  onOpen: (href: string) => void;
  onAddToCart: (p: Product, s: Size) => Promise<boolean>;
  addState: GetAddState;
  availableStock: (p: Product, s: Size) => number;
}) {
  const { product: saved, colorId, size } = item;
  // A variante salva pode ter sido removida ou ficado sem estoque: mostrar "Indisponível", sem quebrar.
  const live = catalog && (colorId === null ? catalog : catalog.colors.some(c => c.id === colorId) ? selectProductColor(catalog, colorId) : undefined);
  const available = !!live && (size === null ? live.variants.some(v => v.stock > 0) : stockFor(live, size) > 0);
  const additionState = addState(live ?? saved, size);
  const href = favoriteHref(item);
  const args = [saved.id, colorId, size] as const;
  const open = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onOpen(href);
  };

  let action: { label: string; disabled: boolean; run?: () => void };
  if (!live || !available) action = { label: "Indisponível", disabled: true };
  else if (size === null) action = { label: "Escolher tamanho", disabled: false, run: () => onOpen(href) };
  else if (additionState === "added") action = { label: "✓ Adicionado!", disabled: true };
  else if (availableStock(live, size) <= 0) action = { label: "Limite de estoque", disabled: true };
  else action = { label: "Adicionar ao carrinho", disabled: additionState !== "idle", run: () => { void onAddToCart(live, size); } };

  return (
    <div className="store-product-card bg-card border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group flex flex-col rounded-b-2xl">
      <div className="store-product-photo relative aspect-[4/5] shrink-0 bg-muted rounded-none">
        <a href={href} onClick={open} className="absolute inset-0 block h-full w-full overflow-hidden">
          <ProductImage src={saved.imageUrl} alt={saved.name}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer ${available ? "" : "opacity-60 grayscale"}`} loading="lazy" />
        </a>
        <ProductFavoriteButton liked onFavorite={() => favorite.onFavorite(...args)}
          favoriteBusy={favorite.favoriteBusy(...args)} favoritePending={favorite.favoritePending(...args)} />
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 rounded-t-2xl rounded-b-[15px] bg-card">
        <div>
          <a href={href} onClick={open} className="text-[17px] font-medium leading-[1.25] text-foreground line-clamp-2 min-h-[2.5rem] break-words hover:text-primary">
            {saved.name}
          </a>
          <p className="mt-1 text-lg font-bold leading-tight text-primary">{formatPrice(saved.price)}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {colorId === null ? "Cor não selecionada" : <>Cor: <span className="font-medium text-foreground">{saved.color.name}</span></>}
          {" · "}
          {size === null ? "Tamanho não selecionado" : <>Tamanho: <span className="font-medium text-foreground">{size}</span></>}
        </p>
        {!available && <p className="text-sm font-semibold text-destructive">Indisponível</p>}
        <button type="button" onClick={action.run} disabled={action.disabled} aria-busy={additionState === "pending"}
          className={`store-add-to-cart min-h-11 disabled:opacity-50 disabled:cursor-not-allowed mt-auto w-full py-2 text-sm font-semibold transition-all duration-200 rounded-none ${additionState === "added"
            ? "store-added bg-accent text-accent-foreground"
            : action.disabled ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"}`}>
          {action.label}
        </button>
      </div>
    </div>
  );
}
