import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { User } from "lucide-react";

export function AccountMenu({ name, role, onLogout, demoActive = false, onToggleDemo }: {
  name: string; role: "USER" | "ADMIN" | "DEMO"; onLogout: () => void;
  demoActive?: boolean; onToggleDemo?: (enable: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const demoLabelId = useId(), demoHintId = useId();
  // Só o cliente logado (ou o próprio cliente já no modo demo) vê o interruptor; admin e visitante não.
  const showDemoSwitch = !!onToggleDemo && (role === "USER" || (role === "DEMO" && demoActive));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const location = useLocation();

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <div ref={root} className="relative"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-t-gray-400 border-r-gray-400 border-b-gray-300 border-l-gray-300 bg-muted text-muted-foreground cursor-pointer transition-all duration-150 hover:translate-y-px hover:text-primary hover:border-t-gray-600 hover:border-r-gray-600 hover:border-b-gray-500 hover:border-l-gray-500 hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] focus-visible:outline-2 focus-visible:outline-primary">
        <User aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
        <span className="sr-only sm:not-sr-only text-[15px] font-medium max-w-40 truncate">{name.trim().split(/\s+/)[0]}</span>
      </button>
      {open && (
        <div id={id} className={`fixed left-0 right-0 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:pt-2 ${showDemoSwitch ? "sm:w-72" : "sm:w-44"}`}>
          <nav aria-label="Menu da conta" className="overflow-hidden border-y border-border bg-card text-[15px] shadow-xl sm:rounded-sm sm:border">
            <Link to="/minha-conta" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Minha Conta</Link>
            {(role === "ADMIN" || role === "DEMO") && <Link to="/manager" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Painel Administrativo</Link>}
            <Link to="/favoritos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Favoritos</Link>
            {role === "USER" && <Link to="/meus-pedidos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Meus Pedidos</Link>}
            {showDemoSwitch && <div className="flex items-start justify-between gap-3 border-y border-border px-4 py-3">
              <div className="min-w-0"><p id={demoLabelId} className="font-medium">Modo demonstração</p>
                <p id={demoHintId} className="mt-0.5 text-xs leading-snug text-muted-foreground">{switching ? (demoActive ? "Saindo..." : "Entrando...") : "Explore o painel administrativo. Nenhuma alteração é salva."}</p></div>
              <button type="button" role="switch" aria-checked={demoActive} aria-labelledby={demoLabelId} aria-describedby={demoHintId} aria-busy={switching} disabled={switching}
                onClick={async () => { setSwitching(true); try { await onToggleDemo!(!demoActive); } finally { setSwitching(false); } }}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 ${demoActive ? "bg-primary" : "bg-muted-foreground/40"}`}>
                <span aria-hidden="true" className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${demoActive ? "translate-x-5" : ""}`} />
              </button>
            </div>}
            <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="w-full text-left px-4 py-3 hover:bg-muted focus-visible:bg-muted">Sair</button>
          </nav>
        </div>
      )}
    </div>
  );
}
