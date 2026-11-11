import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { StockBadgeSettings } from "../../../backend/src/lib/stock-badges";
import type { GetAddState } from "../hooks/useAddFeedback";
import { ProductBadges } from "./ProductBadges";
import { ProductFavoriteButton } from "./ProductFavoriteButton";
import { ProductImage } from "./ProductImage";
import { manualBadgeDimensions } from "./ProductBadge";
import { formatPrice, sizeButtonClass } from "../lib/presentation";
import { selectProductColor, stockFor, type Product, type Size } from "../lib/products";

// Favoritar trabalha com a combinação produto + cor + tamanho (null = não escolhido).
export interface FavoriteControls {
  isFavorite: (productId: number, colorId: number | null, size: string | null) => boolean;
  onFavorite: (productId: number, colorId: number | null, size: string | null) => void;
  favoritePending: (productId: number, colorId: number | null, size: string | null) => boolean;
  favoriteBusy: (productId: number, colorId: number | null, size: string | null) => boolean;
}

export function ColorSelector({ product, onSelect, card = false }: { product: Product; onSelect: (id: number) => void; card?: boolean }) {
  return <div className="space-y-2"><p className="text-sm">Cor: <span className="font-medium">{product.color.name}</span></p>
    <div className="flex gap-2 flex-wrap" role="group" aria-label="Selecionar cor">
      {product.colors.map(color => <button key={color.id} type="button" title={color.colorName} aria-label={color.colorName}
        aria-pressed={product.colorId === color.id} onClick={() => onSelect(color.id)}
        className={card
          ? `h-11 w-11 shrink-0 rounded-[3px] border border-border transition-[border-color,box-shadow] duration-150 hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:h-7 sm:w-7 ${product.colorId === color.id ? "ring-1 ring-primary ring-offset-2 ring-offset-card" : ""}`
          : `h-7 w-7 border rounded-[3px] shadow-sm ${product.colorId === color.id ? "ring-1 ring-primary ring-offset-2 ring-offset-card border-primary" : "border-border"}`}
        style={{ backgroundColor: color.colorValue }} />)}
    </div>
  </div>;
}

export function ProductDetailPage({
  product: baseProduct,
  stockSettings,
  recommendations, onOpenProduct, favorite,
  onBack,
  onAddToCart,
  addState,
  availableStock,
}: {
  product: Product;
  stockSettings: StockBadgeSettings | null;
  recommendations: Product[];
  onOpenProduct: (product: Product) => void;
  favorite: FavoriteControls;
  onBack: () => void;
  onAddToCart: (p: Product, s: Size) => Promise<boolean>;
  addState: GetAddState;
  availableStock: (p: Product, s: Size) => number;
}) {
  const [selectedColorId, setSelectedColorId] = useState(() => { const id = Number(new URLSearchParams(window.location.search).get("colorId")); return baseProduct.colors.some(c => c.id === id) ? id : baseProduct.colorId; });
  // ?tamanho=M (vindo dos Favoritos) pré-seleciona o tamanho se ele existir e tiver estoque nessa cor.
  const [initialSize] = useState(() => new URLSearchParams(window.location.search).get("tamanho"));
  const [badgeColorId, setBadgeColorId] = useState<number | null>(null);
  const product = selectProductColor(baseProduct, baseProduct.colors.some(c => c.id === selectedColorId) ? selectedColorId : baseProduct.colors[0].id);

  const productImages = product.images && product.images.length > 0 ? product.images : [product.imageUrl];
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<Size | null>(() => initialSize && product.sizes.includes(initialSize) && availableStock(product, initialSize) > 0 ? initialSize : null);
  const additionState = addState(product, selectedSize);
  const added = additionState === "added";
  const favoriteArgs = [baseProduct.id, product.colorId, selectedSize] as const;

  return (
    <div className="store-product-detail min-h-screen bg-background text-foreground">


      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft aria-hidden="true" size={16} className="mr-2" /> Voltar para a loja
        </button>

        <div className="store-product-detail-content grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
          <div className="space-y-4">
            <div className="store-product-photo store-detail-photo relative border border-border bg-card">
              <div className="overflow-hidden">
                <ProductImage
                  src={productImages[activeImageIndex]}
                  alt={product.name}
                  className="w-full h-[520px] object-contain bg-muted"
                />
              </div>
              <ProductBadges size="detail" product={baseProduct} settings={stockSettings} selection={{ colorId: badgeColorId ?? undefined, size: selectedSize ?? undefined }} />
              <ProductFavoriteButton liked={favorite.isFavorite(...favoriteArgs)}
                onFavorite={() => favorite.onFavorite(...favoriteArgs)} favoritePending={favorite.favoritePending(...favoriteArgs)} favoriteBusy={favorite.favoriteBusy(...favoriteArgs)} />
            </div>

            {productImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {productImages.map((image, index) => (
                  <button
                    key={`${product.id}-${index}`}
                    type="button"
                    aria-label={`Ver imagem ${index + 1}`}
                    onClick={() => setActiveImageIndex(index)}
                    className={`relative h-20 w-20 shrink-0 overflow-hidden border transition-all ${activeImageIndex === index ? "border-primary" : "border-border"
                      }`}
                  >
                    <ProductImage src={image} alt={`${product.name} ${index + 1}`} className="h-full w-full object-contain bg-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
                {product.public}
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold leading-tight text-foreground">
                {product.name}
              </h1>
            </div>

            {/* Aviso de estoque baixo ao lado do preço, como no card do catálogo (some ao trocar para um tamanho com estoque). */}
            <div className="store-product-price"><div className="text-2xl font-bold text-primary">{formatPrice(product.price)}</div><ProductBadges placement="price" product={baseProduct} settings={stockSettings} selection={{ colorId: badgeColorId ?? undefined, size: selectedSize ?? undefined }} /></div>
            <ColorSelector product={product} onSelect={id => {
              const next = selectProductColor(baseProduct, id);
              setSelectedColorId(id); setBadgeColorId(id); setActiveImageIndex(0);
              if (selectedSize && availableStock(next, selectedSize) <= 0) setSelectedSize(null);
            }} />

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Tamanhos
              </p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    aria-pressed={selectedSize === size}
                    disabled={availableStock(product, size) <= 0}
                    title={stockFor(product, size) === 0 ? "Esgotado" : undefined}
                    type="button"
                    onClick={() => setSelectedSize((current) => (current === size ? null : size))}
                    className={`${sizeButtonClass} relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed border text-sm font-medium transition-all ${selectedSize === size
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted"
                      }`}
                  >
                    {size}
                    {availableStock(product, size) <= 0 && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-foreground/80" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={additionState !== "idle" || !selectedSize || availableStock(product, selectedSize) <= 0}
              aria-busy={additionState === "pending"}
              onClick={async () => {
                if (!selectedSize) return;
                await onAddToCart(product, selectedSize);
              }}
              className={`store-add-to-cart disabled:opacity-50 disabled:cursor-not-allowed w-full py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${added
                ? "store-added bg-accent text-accent-foreground"
                : selectedSize
                  ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
            >
              {added ? "✓ Adicionado!" : !product.variants.some(v => v.stock > 0) ? "Esgotado" : selectedSize && availableStock(product, selectedSize) <= 0 ? "Limite de estoque" : selectedSize ? "Adicionar ao carrinho" : "Selecione o tamanho"}
            </button>

            <div className="border-t border-border pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Detalhes
              </p>
              <p className="text-sm leading-relaxed text-foreground/80">
                {product.description || "Descrição não informada."}
              </p>
            </div>
          </div>
        </div>
        {recommendations.length > 0 && <section aria-labelledby="related-products-title" className="mt-12 border-t border-border pt-8">
          <h2 id="related-products-title" className="mb-6 font-serif text-2xl font-bold tracking-wide">VEJA TAMBÉM</h2>
          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-3 gap-4">
            {recommendations.map(related => <ProductCard key={related.id} product={related} stockSettings={stockSettings}
              favorite={favorite}
              availableStock={availableStock} onAddToCart={onAddToCart} addState={addState} onOpenProduct={onOpenProduct} />)}
          </div>
        </section>}
      </div>

    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

export function ProductCard({
  favorite, stockSettings,
  product: baseProduct, badgeProduct,
  onAddToCart,
  addState,
  availableStock,
  onOpenProduct,
}: {
  favorite: FavoriteControls;
  product: Product;
  badgeProduct?: Product;
  stockSettings: StockBadgeSettings | null;
  onAddToCart: (p: Product, s: Size) => Promise<boolean>;
  addState: GetAddState;
  availableStock: (p: Product, s: Size) => number;
  onOpenProduct?: (product: Product) => void;
}) {
  const [badgeColorId, setBadgeColorId] = useState<number | null>(null);
  const [selectedColorId, setSelectedColorId] = useState(baseProduct.colorId);
  const product = selectProductColor(baseProduct, baseProduct.colors.some(c => c.id === selectedColorId) ? selectedColorId : baseProduct.colors[0].id);

  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const additionState = addState(product, selectedSize);
  const added = additionState === "added";
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const productImages = product.images && product.images.length > 0 ? product.images : [product.imageUrl];
  const hasMultipleImages = productImages.length > 1;

  async function handleAdd() {
    if (!selectedSize) return;
    await onAddToCart(product, selectedSize);
  }

  function showPrevImage() {
    setCurrentImageIndex((prev) => (prev - 1 + productImages.length) % productImages.length);
  }

  function showNextImage() {
    setCurrentImageIndex((prev) => (prev + 1) % productImages.length);
  }

  return (
    <div className="store-product-card bg-card border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group flex flex-col rounded-b-2xl">
      {/* Image */}
      <div className="store-product-photo relative aspect-[4/5] shrink-0 bg-muted rounded-none">
        <a
          href={`?productId=${product.id}&colorId=${product.colorId}`}
          target={onOpenProduct ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={onOpenProduct ? event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); onOpenProduct(baseProduct);
          } : undefined}
          className="absolute inset-0 block h-full w-full overflow-hidden"
        >
          <ProductImage
            src={productImages[currentImageIndex]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer"
            loading="lazy"
          />
        </a>

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                showPrevImage();
              }}
              aria-label="Imagem anterior"
              className="store-product-arrow group/image-arrow absolute left-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full text-foreground focus-visible:outline-none"
            >
              <span className="flex h-7 w-7 items-center justify-center store-image-control rounded-full bg-white/65 backdrop-blur-sm transition-colors duration-200 group-hover/image-arrow:bg-white/90 group-focus-visible/image-arrow:bg-white/90 group-focus-visible/image-arrow:ring-2 group-focus-visible/image-arrow:ring-ring group-focus-visible/image-arrow:ring-offset-2 group-focus-visible/image-arrow:ring-offset-card">
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                showNextImage();
              }}
              aria-label="Próxima imagem"
              className="store-product-arrow group/image-arrow absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full text-foreground focus-visible:outline-none"
            >
              <span className="flex h-7 w-7 items-center justify-center store-image-control rounded-full bg-white/65 backdrop-blur-sm transition-colors duration-200 group-hover/image-arrow:bg-white/90 group-focus-visible/image-arrow:bg-white/90 group-focus-visible/image-arrow:ring-2 group-focus-visible/image-arrow:ring-ring group-focus-visible/image-arrow:ring-offset-2 group-focus-visible/image-arrow:ring-offset-card">
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              </span>
            </button>
            <div className="store-product-photo-pagination absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1.5"
              style={product.badge ? { bottom: manualBadgeDimensions.height + 6 } : undefined}>
              {productImages.map((_, index) => (
                <button
                  key={`${product.id}-${index}`}
                  type="button"
                  aria-label={`Ver imagem ${index + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(index);
                  }}
                  className={`h-1.5 rounded-full transition-all ${currentImageIndex === index ? "w-5 bg-primary" : "w-1.5 bg-white/60 hover:bg-white/90"
                    }`}
                />
              ))}
            </div>
          </>
        )}
        <ProductBadges product={badgeProduct ?? baseProduct} settings={stockSettings} selection={{ colorId: badgeColorId ?? undefined, size: selectedSize ?? undefined }} />
        {/* Wishlist */}
        {/* No card o favorito usa a cor exibida, sem tamanho. */}
        <ProductFavoriteButton liked={favorite.isFavorite(baseProduct.id, product.colorId, null)} onFavorite={() => favorite.onFavorite(baseProduct.id, product.colorId, null)}
          favoriteBusy={favorite.favoriteBusy(baseProduct.id, product.colorId, null)} favoritePending={favorite.favoritePending(baseProduct.id, product.colorId, null)} />
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1 rounded-t-2xl rounded-b-[15px] bg-card">
        <div>
          <p className="text-[17px] font-medium leading-[1.25] text-foreground line-clamp-2 min-h-[2.5rem] break-words">
            {product.name}
          </p>
          <div className="store-product-price mt-1"><p className="text-lg font-bold leading-tight text-primary">{formatPrice(product.price)}</p><ProductBadges placement="price" product={badgeProduct ?? baseProduct} settings={stockSettings} selection={{ colorId: badgeColorId ?? undefined, size: selectedSize ?? undefined }} /></div>
        </div>

        {product.colors.length > 0 && <ColorSelector card product={product} onSelect={id => {
          const next = selectProductColor(baseProduct, id);
          setSelectedColorId(id); setBadgeColorId(id); setCurrentImageIndex(0);
          if (selectedSize && availableStock(next, selectedSize) <= 0) setSelectedSize(null);
        }} />}

        {/* Size buttons */}
        {product.sizes.length > 0 && <div className={`store-product-sizes flex gap-1 flex-wrap ${product.colors.length > 0 ? "mt-2" : ""}`}>
          {product.sizes.map((size) => (
            <button
              key={size}
              aria-pressed={selectedSize === size}
              disabled={availableStock(product, size) <= 0}
              title={stockFor(product, size) === 0 ? "Esgotado" : undefined}
              onClick={() => setSelectedSize((s) => (s === size ? null : size))}
              className={`store-product-size ${sizeButtonClass} relative overflow-hidden min-h-11 min-w-11 disabled:opacity-40 disabled:cursor-not-allowed text-xs border font-medium transition-all rounded-none ${selectedSize === size
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:border-primary/40 hover:bg-muted"
                }`}
            >
              {size}
              {availableStock(product, size) <= 0 && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-foreground/80" />}
            </button>
          ))}
        </div>}

        {/* CTA */}
        <button
          onClick={handleAdd}
          disabled={additionState !== "idle" || !selectedSize || availableStock(product, selectedSize) <= 0}
          aria-busy={additionState === "pending"}
          className={`store-add-to-cart min-h-11 disabled:opacity-50 disabled:cursor-not-allowed mt-auto w-full py-2 text-sm font-semibold transition-all duration-200 rounded-none ${added
            ? "store-added bg-accent text-accent-foreground"
            : selectedSize
              ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
        >
          {added ? "✓ Adicionado!" : !product.variants.some(v => v.stock > 0) ? "Esgotado" : selectedSize && availableStock(product, selectedSize) <= 0 ? "Limite de estoque" : selectedSize ? "Adicionar ao carrinho" : "Selecione o tamanho"}
        </button>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────
