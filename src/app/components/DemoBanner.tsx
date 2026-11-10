import { Link } from "react-router";
import { Eye } from "lucide-react";

// Faixa do modo demonstração: aparece só dentro do /manager, para o cliente com leitura do painel.
export function DemoBanner({ sticky = false }: { sticky?: boolean }) {
  return <div role="note" className={`${sticky ? "sticky top-0 z-50" : ""} flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100`}>
    <span className="inline-flex items-center gap-2"><Eye aria-hidden="true" size={16} className="shrink-0" />Modo demonstração — explore à vontade, as alterações não são salvas.</span>
    <Link to="/"
      className="rounded-md border border-amber-400 bg-white/70 px-2.5 py-0.5 text-sm font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:bg-amber-900">
      Voltar para a loja</Link>
  </div>;
}
