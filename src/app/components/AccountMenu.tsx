import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { User } from "lucide-react";

export function AccountMenu({ name, role, onLogout }: { name: string; role: "USER" | "ADMIN"; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-ee-xs border border-white bg-muted text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
        <User aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
        <span className="sr-only sm:not-sr-only text-[15px] font-medium max-w-40 truncate">{name.trim().split(/\s+/)[0]}</span>
      </button>
      {open && (
        <div id={id} className="fixed left-0 right-0 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-44 sm:pt-2">
          <nav aria-label="Menu da conta" className="overflow-hidden border-y border-border bg-card text-[15px] shadow-xl sm:rounded-xl sm:border">
            <Link to="/minha-conta" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Minha Conta</Link>
            {role === "ADMIN" && <Link to="/manager" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Painel Administrativo</Link>}
            <Link to="/favoritos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Favoritos</Link>
            {role === "USER" && <Link to="/meus-pedidos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Meus Pedidos</Link>}
            <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="w-full text-left px-4 py-3 hover:bg-muted focus-visible:bg-muted">Sair</button>
          </nav>
        </div>
      )}
    </div>
  );
}
