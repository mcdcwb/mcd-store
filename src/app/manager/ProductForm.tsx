import { useEffect, useId, useRef, useState } from "react";
import { Pipette, Plus, Trash2 } from "lucide-react";
import { ProductImage } from "../components/ProductImage";
import { ProductBadge, badgeDefaults } from "../components/ProductBadge";
import { manualBadgeMaxLength } from "../../../backend/src/lib/manual-badges.ts";
import { audiences, labels, normalizeHex, toDraft, toInput, validateDraft, type ManagedProduct, colorDraft, type ColorDraft, type ProductDraft, type ProductInput } from "./products";
import type { Category } from "../lib/categories";
import { CategoryEditor } from "./CategoryEditor";
import { Button } from "../components/ui/button";

type EyeDropperConstructor = new () => { open: (options?: { signal: AbortSignal }) => Promise<{ sRGBHex: string }> };

const inputClass = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
export function ProductForm({ product, categories, onSaveCategory, busy, onSave, onCancel, onUpload }: {
  categories: Category[]; onSaveCategory: (name: string, id?: number) => Promise<Category | null>;
  onUpload: (file: File, signal: AbortSignal) => Promise<string>;
  product?: ManagedProduct; busy: boolean; onSave: (input: ProductInput) => Promise<void>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...toDraft(product), categoryId: product ? String(product.categoryId) : categories[0] ? String(categories[0].id) : "" }));
  const [addingCategory, setAddingCategory] = useState(false);
  const [activeKey, setActiveKey] = useState(draft.colors[0].key);
  const active = draft.colors.find(c => c.key === activeKey) ?? draft.colors[0];
  const [removing, setRemoving] = useState<string | null>(null);
  const changeColor = (key: keyof Omit<ColorDraft, "key" | "id">, value: string | ColorDraft["variants"]) =>
    setDraft(previous => ({ ...previous, colors: previous.colors.map(c => c.key === active.key ? { ...c, [key]: value } : c) }));
  function selectColor(key: string) {
    selection.current?.abort(); selection.current = null; setPicking(false); setColorNotice(""); setActiveKey(key);
  }
  function removeColor(key: string) {
    if (uploadJob.current?.key === key) { uploadJob.current.controller.abort(); uploadJob.current = null; setUploading(null); }
    setUploadNotice(previous => previous?.key === key ? null : previous);
    const next = draft.colors.filter(c => c.key !== key);
    setDraft({ ...draft, colors: next }); selectColor(next[0].key); setRemoving(null);
  }
  const uploadJob = useRef<{ key: string; controller: AbortController } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<{ key: string; error: boolean; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  async function uploadImage(file: File) {
    if (busy || uploadJob.current) return;
    const key = active.key;
    const controller = new AbortController();
    uploadJob.current = { key, controller };
    setUploading(key); setUploadNotice(null);
    try {
      const url = await onUpload(file, controller.signal);
      if (controller.signal.aborted) return;
      setDraft(previous => ({
        ...previous, colors: previous.colors.map(color => {
          if (color.key !== key) return color;
          const images = color.images.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
          if (color.imageUrl.trim() === url || images.includes(url)) return color;
          return !color.imageUrl.trim() && !images.length ? { ...color, imageUrl: url }
            : { ...color, images: [...images, url].join("\n") };
        })
      }));
      setUploadNotice({ key, error: false, message: "Imagem enviada. Salve o produto para confirmar a alteração." });
    } catch (error) {
      if (!controller.signal.aborted) setUploadNotice({ key, error: true, message: error instanceof Error ? error.message : "Não foi possível enviar a imagem. Tente novamente." });
    } finally {
      if (uploadJob.current?.controller === controller) { uploadJob.current = null; setUploading(null); }
    }
  }
  useEffect(() => () => uploadJob.current?.controller.abort(), []);
  const [errors, setErrors] = useState<string[]>([]);
  const colorId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const selection = useRef<AbortController | null>(null);
  const [picking, setPicking] = useState(false);
  const [colorNotice, setColorNotice] = useState("");
  const EyeDropper = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  const supportsEyeDropper = typeof EyeDropper === "function";
  const imageSource = active.imageUrl.trim() || active.images.split(/\r?\n/).find(value => value.trim())?.trim();
  const previewImages = [...new Set([active.imageUrl, ...active.images.split(/\r?\n/)].map(value => value.trim()).filter(Boolean))];
  const hex = normalizeHex(active.colorValue);
  useEffect(() => () => selection.current?.abort(), []);
  const change = (key: keyof Omit<ProductDraft, "colors" | "isPublished">, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  async function pickFromImage() {
    if (!supportsEyeDropper || busy || selection.current || !imageSource) return;
    const controller = new AbortController();
    selection.current = controller;
    setPicking(true);
    setColorNotice("Clique na região desejada da prévia. Esc cancela a seleção.");
    try {
      // Keep open() in the click gesture; awaiting a scroll would lose user activation.
      previewRef.current?.scrollIntoView({ behavior: "instant", block: "center" });
      const result = await new EyeDropper().open({ signal: controller.signal });
      if (controller.signal.aborted) return;
      const selected = normalizeHex(result.sRGBHex);
      if (!selected) throw new Error("Invalid color");
      changeColor("colorValue", selected);
      setColorNotice(`Cor selecionada: ${selected}.`);
    } catch (error) {
      if (controller.signal.aborted) return;
      setColorNotice(error instanceof DOMException && error.name === "AbortError"
        ? "Seleção cancelada. A cor foi mantida."
        : "Não foi possível selecionar a cor. Use o seletor de cores ou informe o HEX.");
    } finally {
      if (!controller.signal.aborted) { selection.current = null; setPicking(false); }
    }
  }
  const variant = (index: number, key: "value" | "stock", value: string) => changeColor("variants", active.variants.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const colorField = (label: string, key: "colorName" | "imageUrl") => <label className="block space-y-2 text-sm font-medium">{label}<input className={inputClass} value={active[key]} onChange={event => changeColor(key, event.target.value)} /></label>;
  const field = (label: string, key: keyof Omit<ProductDraft, "colors" | "isPublished">, type = "text") => (
    <label className="block space-y-2 text-sm font-medium">{label}
      <input className={inputClass} value={draft[key]} onChange={event => change(key, event.target.value)} type={type}
        {...(key === "price" ? { min: "0.01", step: "any" } : {})} />
    </label>
  );
  return <form noValidate onSubmit={async event => {
    event.preventDefault();
    if (busy || picking || uploadJob.current) return;
    const issues = validateDraft(draft, product?.badge);
    setErrors(issues);
    if (!issues.length) {
      const input = toInput(draft);
      // Preserve legacy text verbatim when only other fields are edited.
      if (product && draft.badge === (product.badge ?? "")) delete input.badge;
      await onSave(input);
    }
  }} className="space-y-6">
    {errors.length > 0 && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><ul className="list-disc pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    <fieldset disabled={busy} className="grid min-w-0 gap-6 disabled:opacity-60 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5">
          <h2 className="font-semibold text-lg">Informações do produto</h2>
          {field("Nome", "name")}
          <label className="block space-y-2 text-sm font-medium">Descrição<textarea className={inputClass} rows={4} value={draft.description} onChange={event => change("description", event.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Preço (R$)", "price", "number")}
            <div className="space-y-2 text-sm font-medium">
              <label htmlFor={`${colorId}-badge`}>Badge (opcional)</label>
              <input id={`${colorId}-badge`} className={inputClass} value={draft.badge} maxLength={manualBadgeMaxLength}
                aria-describedby={`${colorId}-badge-count${draft.badge.length > manualBadgeMaxLength ? ` ${colorId}-badge-legacy` : ""}`}
                onChange={event => change("badge", event.target.value.slice(0, manualBadgeMaxLength))} />
              <p id={`${colorId}-badge-count`} className="text-right text-xs font-normal text-muted-foreground">{draft.badge.length}/{manualBadgeMaxLength}</p>
              {draft.badge.length > manualBadgeMaxLength && <p id={`${colorId}-badge-legacy`} className="text-xs font-normal text-muted-foreground">Texto antigo preservado. Ao alterar o badge, use até 12 caracteres; outros campos podem ser salvos normalmente.</p>}
            </div>
            <label className="block space-y-2 text-sm font-medium">Público<select aria-label="Público" className={inputClass} value={draft.public} onChange={event => change("public", event.target.value)}>
              {[...new Set([...audiences, draft.public])].map(value => <option key={value} value={value}>{labels[value] ?? value}</option>)}
            </select></label>
            <div className="space-y-2">
              <label className="block space-y-2 text-sm font-medium">Categoria<select aria-label="Categoria" className={inputClass} value={draft.categoryId} onChange={event => change("categoryId", event.target.value)}>
                <option value="">Selecione uma categoria</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
              <Button type="button" variant="outline" aria-expanded={addingCategory} onClick={() => setAddingCategory(!addingCategory)} className="h-auto min-h-11 rounded-lg px-3 py-2 text-primary">+ Nova categoria</Button>
              {addingCategory && <CategoryEditor busy={busy} onCancel={() => setAddingCategory(false)} onSave={async name => {
                const category = await onSaveCategory(name);
                if (category) change("categoryId", String(category.id));
                return category;
              }} />}
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.isPublished} onChange={event => setDraft(previous => ({ ...previous, isPublished: event.target.checked }))} />Publicado na loja
              <p className="text-xs text-muted-foreground ml-2 mt-0.5">Itens não publicados ainda aparecerão no carrossel.</p></label>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5">
          <h2 className="font-semibold text-lg">Cores do badge manual</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {([['badgeBackgroundColor', 'Cor de fundo do badge'], ['badgeTextColor', 'Cor do texto do badge']] as const).map(([key, label]) => <div key={key} className="min-w-0 space-y-2 text-sm font-medium">
              <label htmlFor={`${colorId}-${key}`}>{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`Seletor: ${label}`} value={normalizeHex(draft[key]) ?? (key === 'badgeBackgroundColor' ? badgeDefaults.background : badgeDefaults.text)}
                  onChange={event => change(key, event.target.value.toUpperCase())} className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1" />
                <input id={`${colorId}-${key}`} className={`${inputClass} min-w-0 font-mono`} value={draft[key]} aria-invalid={!normalizeHex(draft[key])}
                  onChange={event => change(key, normalizeHex(event.target.value) ?? event.target.value)} placeholder="#RRGGBB" />
              </div>
            </div>)}
          </div>
          <div aria-label="Prévia do badge" className="max-w-full">
            {draft.badge.trim() ? <ProductBadge label={draft.badge.trim()} background={normalizeHex(draft.badgeBackgroundColor) ?? badgeDefaults.background} color={normalizeHex(draft.badgeTextColor) ?? badgeDefaults.text} />
              : <span className="text-sm text-muted-foreground">Sem badge</span>}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5">
          <h2 className="font-semibold text-lg">Cores do produto</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cores do produto">
            {draft.colors.map((color, index) => <button key={color.key} type="button" aria-pressed={color.key === active.key}
              onClick={() => selectColor(color.key)} className={`max-w-full break-words rounded-lg border px-3 py-2 ${color.key === active.key ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
              {color.colorName || `Cor ${index + 1}`}
            </button>)}
            <Button type="button" variant="outline" onClick={() => { const color = colorDraft(); setDraft(p => ({ ...p, colors: [...p.colors, color] })); selectColor(color.key); }} className="h-auto min-h-10 rounded-lg px-3 py-2">+ Adicionar cor</Button>
          </div>
          <button type="button" disabled={draft.colors.length === 1} className="text-sm text-destructive disabled:opacity-40" onClick={() => {
            if (active.id || active.colorName || active.colorValue || active.imageUrl || active.images || active.variants.some(v => v.value || Number(v.stock))) setRemoving(active.key);
            else removeColor(active.key);
          }}>Remover cor</button>
          {removing && <div role="alertdialog" aria-label="Remover cor?" className="rounded-lg border border-destructive p-4 space-y-3">
            <p>Remover esta cor, suas imagens e variantes? Ao salvar, os itens dessa cor também serão removidos dos carrinhos.</p>
            <div className="flex flex-wrap gap-4"><button type="button" onClick={() => setRemoving(null)}>Cancelar remoção</button><button type="button" className="text-destructive" onClick={() => removeColor(removing)}>Confirmar remoção da cor</button></div>
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {colorField("Nome da cor", "colorName")}
            <div className="min-w-0 space-y-2 text-sm font-medium">
              <label htmlFor={colorId}>Valor da cor</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Seletor de cor" value={hex ?? "#000000"}
                  onChange={event => { changeColor("colorValue", normalizeHex(event.target.value)!); setColorNotice(""); }}
                  className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1" />
                <input id={colorId} className={inputClass + " min-w-0 font-mono"} placeholder="#1F2937" value={active.colorValue}
                  aria-describedby={`${colorId}-hint`} aria-invalid={Boolean(active.colorValue.trim() && !hex)}
                  onChange={event => { changeColor("colorValue", normalizeHex(event.target.value) ?? event.target.value); setColorNotice(""); }} />
              </div>
              <button type="button" onClick={pickFromImage} disabled={picking || !supportsEyeDropper || !imageSource}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                <Pipette size={16} aria-hidden="true" />{picking ? "Selecionando..." : "Selecionar na imagem"}
              </button>
              <p id={`${colorId}-hint`} className="text-xs font-normal text-muted-foreground">
                {!supportsEyeDropper ? "Conta-gotas indisponível neste navegador. Use o seletor ou o HEX." : !imageSource ? "Adicione uma imagem para usar o conta-gotas." : "Selecione uma região da prévia do produto. Esc cancela."}
              </p>
              {colorNotice && <p role="status" className="text-xs font-normal text-muted-foreground">{colorNotice}</p>}
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="font-semibold text-lg">Variantes e estoque</h2>
            <Button type="button" variant="outline" onClick={() => changeColor("variants", [...active.variants, { value: "", stock: "0" }])} className="h-auto min-h-10 rounded-lg px-3 py-2 font-semibold text-primary"><Plus size={16} />Adicionar variante</Button>
          </div>
          <p className="text-sm text-muted-foreground">Use tamanhos, numerações ou outros valores. Cada variante tem seu próprio estoque.</p>
          {active.variants.length === 0 && <p className="text-sm text-muted-foreground">Sem variantes. Esta cor ficará sem estoque.</p>}
          {active.variants.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
            <label className="space-y-1 text-sm">Variante {index + 1}<input className={inputClass} value={item.value} onChange={event => variant(index, "value", event.target.value)} placeholder="P, 38, Único..." /></label>
            <label className="space-y-1 text-sm">Estoque {index + 1}<input className={inputClass} type="number" min="0" max="2147483647" step="1" value={item.stock} onChange={event => variant(index, "stock", event.target.value)} /></label>
            <button type="button" aria-label={`Remover variante ${index + 1}`} className="p-3 text-destructive rounded-lg hover:bg-destructive/10" onClick={() => changeColor("variants", active.variants.filter((_, i) => i !== index))}><Trash2 size={18} /></button>
          </div>)}
        </section>
      </div>
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5 self-start">
        <h2 className="font-semibold text-lg">Imagens desta cor</h2>
        <div ref={previewRef}><ProductImage src={imageSource} alt="Prévia do produto" className="w-full h-56 object-contain rounded-lg bg-muted" /></div>
        {previewImages.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Imagens desta cor">
          {previewImages.map((src, index) => <ProductImage key={src} src={src} alt={`Imagem ${index + 1} de ${active.colorName || "esta cor"}`} className="h-20 w-20 rounded-lg bg-muted object-contain" />)}
        </div>}
        <div className="space-y-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Arquivo de imagem" className="sr-only" tabIndex={-1} disabled={Boolean(uploading)} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (file) void uploadImage(file);
          }} />
          <Button type="button" variant="outline" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()} className="h-auto min-h-11 rounded-lg px-3 py-2">{uploading ? "Enviando imagem..." : "Selecionar imagem"}</Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP. Até 5 MiB por imagem.</p>
          {uploading && <p role="status" className="text-sm text-muted-foreground">Enviando imagem para {draft.colors.find(color => color.key === uploading)?.colorName || "a cor selecionada"}...</p>}
          {uploadNotice && <p role={uploadNotice.error ? "alert" : "status"} className={`text-sm rounded-lg border p-3 ${uploadNotice.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/10 text-foreground"}`}>
            {uploadNotice.key !== active.key && <span className="font-semibold">{draft.colors.find(color => color.key === uploadNotice.key)?.colorName || "Cor do upload"}: </span>}
            {uploadNotice.message}
          </p>}
        </div>
        {colorField("Imagem principal", "imageUrl")}
        <label className="block space-y-2 text-sm font-medium">Imagens adicionais<textarea className={inputClass} rows={5} value={active.images} onChange={event => changeColor("images", event.target.value)} placeholder="Uma URL ou caminho por linha" /></label>
        <p className="text-xs text-muted-foreground">Informe URLs ou caminhos de imagens já disponíveis. Uma imagem adicional por linha.</p>
      </section>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
      <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-border px-5 py-2.5 transition-colors hover:bg-muted active:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
      <Button type="submit" disabled={busy || picking || Boolean(uploading)} aria-busy={busy} className="h-auto min-h-11 rounded-lg px-5 py-2.5 font-semibold">{busy ? "Salvando..." : "Salvar produto"}</Button>
    </div>
  </form>;
}
