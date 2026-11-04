import { useState } from "react";
import { Link } from "react-router";
import type { Category } from "../lib/categories";
import { CategoryEditor } from "./CategoryEditor";
import { SettingsSectionContent } from "./SettingsSectionContent";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";

export function CategoryManagement({ categories, busy, onSave, onDelete, settings = false }: {
  categories: Category[]; busy: boolean; onSave: (name: string, id?: number) => Promise<Category | null>; onDelete: (id: number) => Promise<boolean>;
  settings?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const content = <>
    {(settings || open) && <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">Categorias com produtos associados só podem ser excluídas após transferir esses produtos para outra categoria.</p>
      {settings ? <CategoryEditor persistent settings busy={busy} onSave={onSave} onCancel={() => { }} /> : <button type="button" disabled={busy} onClick={() => setEditing("new")} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">+ Nova categoria</button>}
      {editing === "new" && <CategoryEditor busy={busy} onSave={onSave} onCancel={() => setEditing(null)} />}
      {!categories.length && <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>}
      {categories.map(category => <div key={category.id} className="border-t border-border pt-3">
        {editing !== "new" && editing?.id === category.id ? <CategoryEditor settings={settings} category={category} busy={busy} onSave={onSave} onCancel={() => setEditing(null)} /> :
          <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1 break-words text-sm"><span>{category.name}</span>{category.productCount !== undefined && <p className="mt-1 text-xs text-muted-foreground">{category.productCount > 0 ? <Link to={`/manager/produtos?categoria=${category.id}`} className="inline-flex min-h-8 items-center rounded px-1 text-primary underline underline-offset-2 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{category.productCount} {category.productCount === 1 ? "produto" : "produtos"}</Link> : <span>{category.productCount} produtos</span>}</p>}</div>
            <button type="button" disabled={busy} onClick={() => setEditing(category)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50" aria-label={`${settings ? "Editar" : "Renomear"} ${category.name}`}>{settings ? "Editar" : "Renomear"}</button>
            <button type="button" disabled={busy} onClick={() => setDeleting(category)} className="min-h-11 rounded-lg border border-destructive/25 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Excluir ${category.name}`}>Excluir</button>
          </div>}
      </div>)}
    </div>}
    <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir categoria?</AlertDialogTitle><AlertDialogDescription>Excluir “{deleting?.name}”? A exclusão será bloqueada se houver qualquer produto associado.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><button type="button" disabled={busy} aria-busy={busy} className="rounded-lg bg-destructive px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={async () => { if (deleting && await onDelete(deleting.id)) setDeleting(null); }}>{busy ? "Excluindo..." : "Confirmar exclusão de categoria"}</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
  return <section aria-label={settings ? "Categorias de produtos" : "Gerenciar categorias"} className={settings ? "mt-6 max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8" : "rounded-xl border border-border bg-card p-4 mb-5"}>
    {settings ? <SettingsSectionContent title="Categorias de produtos"><p className="mt-2 text-sm text-muted-foreground">Gerencie as categorias utilizadas para organizar os produtos da loja.</p>{content}</SettingsSectionContent> : <><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Gerenciar categorias</button>{content}</>}
  </section>;
}
