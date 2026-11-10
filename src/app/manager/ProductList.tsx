import type { Category } from "../lib/categories";
import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GalleryHorizontalEnd, GripVertical, Info, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ProductImage } from "../components/ProductImage";
import { Button } from "../components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";
import { isLowStock, isEmptyVariant, labels, matchesStock, stockFilterLabels, getProductVariants, isProductOutOfStock, totalStock, type ManagedProduct, type StockFilter } from "./products";

export function StockBadge({ product }: { product: ManagedProduct }) {
  const empty = isProductOutOfStock(product);
  const label = getProductVariants(product).length === 0 ? "Sem variantes" : empty ? "Sem estoque" : "Disponível";
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${empty ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{label}</span>;
}
// A lista do carrossel só se move na vertical.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type CarouselItemProps = { product: ManagedProduct; index: number; total: number; busy: boolean; onUp?: () => void; onDown?: () => void };
// Conteúdo do item (usado na lista e no card flutuante do DragOverlay).
function CarouselItemCard({ product, index, total, busy, onUp, onDown, overlay = false, handle }: CarouselItemProps & { overlay?: boolean; handle?: React.ReactNode }) {
  return <div className={`flex min-w-0 items-center gap-3 rounded-lg border bg-background p-2.5 ${overlay ? "cursor-grabbing border-primary shadow-lg ring-2 ring-primary/30" : "border-border"}`}>
    <span aria-label={`Posição ${index + 1}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
    {handle ?? <span aria-hidden="true" className="grid size-9 place-items-center text-muted-foreground"><GripVertical size={18} /></span>}
    <ProductImage src={product.colors[0]?.imageUrl || product.colors[0]?.images[0]} alt="" className="h-12 w-10 shrink-0 rounded object-cover bg-muted" />
    <span className="min-w-0 flex-1 break-words text-sm font-medium">{product.name}</span>
    <div className="flex shrink-0 gap-1">
      <button type="button" aria-label={`Mover ${product.name} para cima`} disabled={busy || index === 0} onClick={onUp} className="grid size-9 place-items-center rounded-md border border-border hover:bg-muted disabled:opacity-40"><ArrowUp size={16} /></button>
      <button type="button" aria-label={`Mover ${product.name} para baixo`} disabled={busy || index === total - 1} onClick={onDown} className="grid size-9 place-items-center rounded-md border border-border hover:bg-muted disabled:opacity-40"><ArrowDown size={16} /></button>
    </div>
  </div>;
}
// Item ordenável: listeners/attributes só na alça (6 pontos); enquanto arrasta, a posição de origem vira
// um marcador tracejado (placeholder) e os demais itens deslizam com a transição do dnd-kit.
function SortableCarouselItem(props: CarouselItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.product.id, attributes: { roleDescription: "item reordenável" } });
  return <li ref={setNodeRef} data-carousel-item={props.product.id} style={{ transform: CSS.Transform.toString(transform), transition }}
    className={isDragging ? "rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 [&>*]:invisible" : undefined}>
    <CarouselItemCard {...props} handle={<button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Arraste para reordenar ${props.product.name}`}
      className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <GripVertical aria-hidden="true" size={18} />
    </button>} />
  </li>;
}

export function ProductList({ categories, threshold, products, busy, error, onDelete, onCarousel, onCarouselOrder }: { categories: Category[]; threshold: number; products: ManagedProduct[]; busy: boolean; error: string | null; onDelete: (id: number) => Promise<boolean>; onCarousel: (id: number, selected: boolean) => Promise<boolean>; onCarouselOrder: (productIds: number[]) => Promise<boolean> }) {
  const [params, setParams] = useSearchParams();
  const publicationHelpId = useId();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(() => params.get("categoria") ?? "");
  const [audience, setAudience] = useState("");
  const [onlyCarousel, setOnlyCarousel] = useState(false);
  const [publication, setPublication] = useState("");
  const carouselProducts = products.filter(product => product.inCarousel).sort((a, b) => a.carouselPosition - b.carouselPosition || a.id - b.id);
  const carouselSignature = carouselProducts.map(product => `${product.id}:${product.carouselPosition}`).join(",");
  const savedIds = carouselProducts.map(product => product.id);
  const [draftOrder, setDraftOrder] = useState<number[]>(savedIds);
  const [savedOrder, setSavedOrder] = useState(savedIds.join(","));
  // Arraste (dnd-kit): mouse/toque pela alça (PointerSensor) e teclado (espaço pega, setas movem,
  // espaço solta, Esc cancela). A ordem só muda no rascunho; o banco só em "Salvar ordem".
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [activeId, setActiveId] = useState<number | null>(null);
  useEffect(() => {
    if (activeId === null) return;
    document.body.style.cursor = "grabbing";
    return () => { document.body.style.cursor = ""; };
  }, [activeId]);
  useEffect(() => {
    setDraftOrder(savedIds);
    setSavedOrder(savedIds.join(","));
  // The signature captures membership and persisted order changes from the server.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselSignature]);
  function moveCarouselItem(fromId: number, toId: number) {
    if (fromId === toId) return;
    setDraftOrder(current => {
      const from = current.indexOf(fromId), to = current.indexOf(toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  }
  const currentDraft = draftOrder.filter(id => savedIds.includes(id));
  const displayedOrder = [...currentDraft, ...savedIds.filter(id => !currentDraft.includes(id))];
  const hasOrderChanges = displayedOrder.join(",") !== savedOrder;
  const productName = (id: UniqueIdentifier) => carouselProducts.find(item => item.id === Number(id))?.name ?? "Produto";
  const positionOf = (id: UniqueIdentifier) => displayedOrder.indexOf(Number(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${productName(active.id)} selecionado, na posição ${positionOf(active.id)} de ${displayedOrder.length}.`,
    onDragOver: ({ active, over }) => over ? `${productName(active.id)} sobre a posição ${positionOf(over.id)} de ${displayedOrder.length}.` : `${productName(active.id)} fora da lista.`,
    onDragEnd: ({ active, over }) => over ? `${productName(active.id)} solto na posição ${positionOf(over.id)} de ${displayedOrder.length}. Clique em Salvar ordem para gravar.` : `${productName(active.id)} solto fora da lista; ordem mantida.`,
    onDragCancel: ({ active }) => `Movimento cancelado. ${productName(active.id)} voltou para a posição ${positionOf(active.id)}.`,
  };
  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = displayedOrder.indexOf(Number(active.id)), to = displayedOrder.indexOf(Number(over.id));
    if (from >= 0 && to >= 0) setDraftOrder(arrayMove(displayedOrder, from, to));
  }
  const activeProduct = activeId === null ? undefined : carouselProducts.find(item => item.id === activeId);
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
    {carouselProducts.length > 0 && <section aria-labelledby="carousel-order-title" className="mb-5 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="carousel-order-title" className="text-lg font-semibold">Ordem do carrossel</h2><p className="mt-1 text-sm text-muted-foreground">Arraste os produtos para reorganizar. Use os botões de seta para ajustar a posição.</p></div>
        {hasOrderChanges && <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="text-sm font-medium text-amber-700">Ordem alterada, ainda não salva</span>
          <Button type="button" disabled={busy} className="ring-2 ring-amber-400 ring-offset-2 ring-offset-card" onClick={async () => {
            if (await onCarouselOrder(displayedOrder)) setSavedOrder(displayedOrder.join(","));
          }}>Salvar ordem</Button>
        </div>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}
        accessibility={{ announcements, screenReaderInstructions: { draggable: "Para reordenar, pressione espaço para pegar o produto, use as setas para cima e para baixo para mover, espaço para soltar ou Esc para cancelar." } }}
        onDragStart={({ active }) => setActiveId(Number(active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <SortableContext items={displayedOrder} strategy={verticalListSortingStrategy}>
          <ol className="mt-4 space-y-2">
            {displayedOrder.map((id, index) => {
              const product = carouselProducts.find(item => item.id === id);
              if (!product) return null;
              return <SortableCarouselItem key={product.id} product={product} index={index} total={displayedOrder.length} busy={busy}
                onUp={() => moveCarouselItem(product.id, displayedOrder[index - 1]!)} onDown={() => moveCarouselItem(product.id, displayedOrder[index + 1]!)} />;
            })}
          </ol>
        </SortableContext>
        <DragOverlay>{activeProduct && <CarouselItemCard product={activeProduct} index={displayedOrder.indexOf(activeProduct.id)} total={displayedOrder.length} busy overlay />}</DragOverlay>
      </DndContext>
    </section>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 rounded-xl border border-border bg-card p-4 mb-5">
      <label className="flex flex-col gap-2 text-sm"><span className="flex items-center gap-2"><Search size={14} />Buscar por nome</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2" placeholder="Nome do produto" /></label>
      <label className="flex flex-col gap-2 text-sm"><span>Categoria</span><select aria-label="Categoria" value={category} onChange={event => setCategoryFilter(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="flex flex-col gap-2 text-sm"><span>Público</span><select aria-label="Público" value={audience} onChange={event => setAudience(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos os públicos</option>{[...new Set(products.map(p => p.public))].map(value => <option key={value} value={value}>{labels[value] ?? value}</option>)}</select></label>
      <label className="flex min-w-0 flex-col gap-2 text-sm xl:col-span-2"><span>Estoque</span><select aria-label="Estoque" value={stock} onChange={event => setStock(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos os estoques</option>{Object.entries(stockFilterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end h-10 text-sm whitespace-nowrap"><input type="checkbox" checked={onlyCarousel} onChange={event => setOnlyCarousel(event.target.checked)} className="size-4 accent-primary" />Apenas itens do carrossel</label>
      {/* "Publicação" + ajuda. A 1ª coluna interna tem exatamente a largura de uma coluna da grade
          ((100% - gap) / 2 de um bloco que ocupa 2 colunas), então nenhum filtro muda de largura.
          ≥1024px: ajuda à direita, alinhada ao select; abaixo disso, embaixo do filtro, na largura toda. */}
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[calc((100%-0.75rem)/2)_minmax(0,1fr)]">
      <label className="flex flex-col gap-2 text-sm"><span>Publicação</span><select aria-label="Publicação" aria-describedby={publicationHelpId} value={publication} onChange={event => setPublication(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Todas as publicações</option><option value="published">Publicados</option><option value="hidden">Não publicados</option></select></label>
      <p id={publicationHelpId} className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] leading-5 text-muted-foreground sm:col-span-2 lg:col-span-1 lg:mt-7 lg:max-w-[420px] lg:self-start">
        <Info aria-hidden="true" size={15} className="mt-[3px] shrink-0" />
        <span><span className="font-semibold text-foreground/80">Só produtos publicados aparecem no catálogo da loja.</span> Para exibir um produto apenas no carrossel, deixe-o como “Não publicado”.</span>
      </p>
      </div>
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
