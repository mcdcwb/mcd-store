import type { Category } from "../lib/categories";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { GalleryHorizontalEnd, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ProductImage } from "../components/ProductImage";
import { Button } from "../components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";
import { isLowStock, isEmptyVariant, labels, matchesStock, stockFilterLabels, getProductVariants, isProductOutOfStock, totalStock, type ManagedProduct, type StockFilter } from "./products";

export function StockBadge({ product }: { product: ManagedProduct }) {
  const empty = isProductOutOfStock(product);
  const label = getProductVariants(product).length === 0 ? "Sem variantes" : empty ? "Sem estoque" : "Disponível";
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${empty ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{label}</span>;
}
export function ProductList({ categories, threshold, products, busy, error, onDelete, onCarousel }: { categories: Category[]; threshold: number; products: ManagedProduct[]; busy: boolean; error: string | null; onDelete: (id: number) => Promise<boolean>; onCarousel: (id: number, selected: boolean) => Promise<boolean> }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(() => params.get("categoria") ?? "");
  const [audience, setAudience] = useState("");
  const [onlyCarousel, setOnlyCarousel] = useState(false);
  const [publication, setPublication] = useState("");
  useEffect(() => { if (category && !categories.some(c => String(c.id) === category)) setCategoryFilter(""); }, [categories, category]);
  useEffect(() => { const nextCategory = params.get("categoria") ?? ""; if (nextCategory !== category) setCategory(nextCategory); }, [params, category]);
  function setCategoryFilter(value: string) {
    setCategory(value);
    setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set("categoria", value); else next.delete("categoria"); return next; });
  }
  const rawStock = params.get("estoque");
  const stock: StockFilter = rawStock === "sem-estoque" || rawStock === "variante-sem-estoque" || rawStock === "variante-baixo" ? rawStock : "";
  useEffect(() => {
    if (rawStock !== null && stock === "") {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete("estoque");
        return next;
      }, { replace: true });
    }
  }, [rawStock, stock, setParams]);
  function setStock(value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set("estoque", value); else next.delete("estoque");
      return next;
    });
  }
  const carouselFull = products.filter(product => product.inCarousel).length >= 5;
  const [deleting, setDeleting] = useState<ManagedProduct | null>(null);
  const visible = products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) &&
    (!category || String(product.categoryId) === category) && (!audience || product.public === audience) && (!publication || product.isPublished === (publication === "published")) && (!onlyCarousel || product.inCarousel) && matchesStock(product, stock, threshold))
    .sort((a, b) => Number(b.inCarousel) - Number(a.inCarousel));
  return <>
    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
      <div><h1 className="font-serif text-3xl font-bold">Produtos</h1><p className="text-muted-foreground mt-1">Gerencie as peças e a disponibilidade da loja.</p></div>
      <Button asChild className="h-auto min-h-11 rounded-lg px-4 py-2.5 font-semibold"><Link to="/manager/produtos/novo"><Plus size={18} />Novo produto</Link></Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 rounded-xl border border-border bg-card p-4 mb-5">
      <label className="flex flex-col gap-2 text-sm"><span className="flex items-center gap-2"><Search size={14} />Buscar por nome</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2" placeholder="Nome do produto" /></label>
      <label className="flex flex-col gap-2 text-sm"><span>Categoria</span><select aria-label="Categoria" value={category} onChange={event => setCategoryFilter(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="flex flex-col gap-2 text-sm"><span>Público</span><select aria-label="Público" value={audience} onChange={event => setAudience(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos os públicos</option>{[...new Set(products.map(p => p.public))].map(value => <option key={value} value={value}>{labels[value] ?? value}</option>)}</select></label>
      <label className="flex min-w-0 flex-col gap-2 text-sm xl:col-span-2"><span>Estoque</span><select aria-label="Estoque" value={stock} onChange={event => setStock(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos os estoques</option>{Object.entries(stockFilterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end h-10 text-sm whitespace-nowrap"><input type="checkbox" checked={onlyCarousel} onChange={event => setOnlyCarousel(event.target.checked)} className="size-4 accent-primary" />Apenas itens do carrossel</label>
      <label className="flex flex-col gap-2 text-sm"><span>Publicação</span><select aria-label="Publicação" value={publication} onChange={event => setPublication(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todas as publicações</option><option value="published">Publicados</option><option value="hidden">Não publicados</option></select></label>
    </div>
    {stock && <div className="flex flex-wrap items-center gap-2 mb-4 text-sm"><span className="rounded-full bg-primary/10 text-primary px-3 py-1">Filtro: {stockFilterLabels[stock]}</span><button type="button" onClick={() => setStock("")} className="min-h-11 px-2 text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Remover filtro de estoque</button></div>}
    <p className="mb-3 text-sm text-muted-foreground">{visible.length} produto(s)</p>
    <div className="space-y-3">
      {visible.map(product => <article key={product.id} aria-label={product.name} className={`flex flex-wrap gap-4 rounded-xl border bg-card p-4 sm:p-5 items-center transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${product.inCarousel ? "border-primary/80 ring-1 ring-primary/40" : "border-border"}`}>
        <ProductImage src={product.colors[0]?.imageUrl || product.colors[0]?.images[0]} alt={product.name} className="h-24 w-20 object-cover rounded-lg bg-muted shrink-0" />
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="font-semibold break-words">{product.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{product.category} · {labels[product.public] ?? product.public}{!product.isPublished && " · Não publicado"}</p>
          <p className="font-semibold mt-1">{product.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        </div>
        <div className="flex-1 min-w-0 basis-44 space-y-2">
          <div className="flex flex-wrap gap-1.5">{product.colors.flatMap(color => color.variants.map(variant => {
            const empty = stock === "variante-sem-estoque" && isEmptyVariant(variant);
            const low = stock === "variante-baixo" && isLowStock(variant.stock, threshold);
            return <span key={`${color.id}-${variant.value}`} className={`text-xs rounded border px-2 py-1 break-words max-w-full ${empty ? "border-destructive/25 bg-destructive/10 text-destructive" : low ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border"}`}>{empty ? `${color.colorName} / ${variant.value} — Sem estoque` : low ? `${color.colorName} / ${variant.value} — ${variant.stock} ${variant.stock === 1 ? "unidade" : "unidades"} (estoque baixo)` : `${color.colorName} · ${variant.value}: ${variant.stock}`}</span>;
          }))}{!product.colors.some(c => c.variants.length) && <span className="text-sm text-muted-foreground">Sem variantes</span>}</div>
          <div className="flex gap-2 items-center flex-wrap"><span className="text-sm">Estoque: {totalStock(product)}</span><StockBadge product={product} /></div>
        </div>
        <div className="flex flex-col gap-2">
          <Link to={`/manager/produtos/${product.id}/editar`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950 transition-colors hover:border-amber-400 hover:bg-amber-200 active:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-700 dark:bg-amber-200 dark:text-slate-950 dark:hover:bg-amber-100"><Pencil size={15} />Editar</Link>
          <span title={!product.inCarousel && carouselFull ? "Limite de 5 produtos no carrossel" : product.inCarousel ? undefined : "Adicionar ao carrossel"}>
            <button disabled={busy || (!product.inCarousel && carouselFull)} aria-label={product.inCarousel ? "Remover do carrossel" : "Adicionar ao carrossel"} aria-pressed={product.inCarousel} onClick={() => onCarousel(product.id, !product.inCarousel)} className={`group/carousel inline-flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${product.inCarousel ? "border-primary/30 bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
              <GalleryHorizontalEnd size={15} />
              <span aria-hidden="true" className="grid text-left whitespace-nowrap">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">Adicionar ao carrossel</span>
                <span className={`col-start-1 row-start-1 transition-opacity duration-200 motion-reduce:transition-none ${product.inCarousel ? "group-hover/carousel:opacity-0 group-focus-visible/carousel:opacity-0" : ""}`}>{product.inCarousel ? "No carrossel" : "Adicionar ao carrossel"}</span>
                <span className={`col-start-1 row-start-1 opacity-0 transition-opacity duration-200 motion-reduce:transition-none ${product.inCarousel ? "group-hover/carousel:opacity-100 group-focus-visible/carousel:opacity-100" : ""}`}>Remover do carrossel</span>
              </span>
            </button>
          </span>
          <button disabled={busy} onClick={() => setDeleting(product)} className="inline-flex items-center gap-2 rounded-lg border border-destructive/25 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={15} />Excluir</button>
        </div>
      </article>)}
      {!visible.length && <div className="text-center rounded-xl border border-border bg-card py-16 text-muted-foreground">Nenhum produto encontrado.</div>}
    </div>
    <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Excluir produto?</AlertDialogTitle><AlertDialogDescription>Deseja excluir “{deleting?.name}”? Suas variantes também serão removidas. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <button disabled={busy} className="rounded-lg bg-destructive text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={async () => { if (deleting && await onDelete(deleting.id)) setDeleting(null); }}>{busy ? "Excluindo..." : "Confirmar exclusão"}</button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
