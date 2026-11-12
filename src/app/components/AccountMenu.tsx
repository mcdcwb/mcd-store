import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { User } from "lucide-react";
import type { PanelAccess } from "../lib/auth";

// panelAccess (do /auth/me): "admin" mostra o painel completo; "read-only" mostra o link do modo
// demonstração para o próprio cliente (sem trocar de conta); "none" esconde o painel.
export function AccountMenu({ name, role, panelAccess, onLogout }: {
  name: string; role: "USER" | "ADMIN"; panelAccess: PanelAccess; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelDemo = role === "USER" && panelAccess === "read-only";
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
    <div ref={root} className="relative min-w-0"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className="flex min-w-0 max-w-full items-center gap-1.5 px-3 py-2 rounded-sm border border-t-gray-400 border-r-gray-400 border-b-gray-300 border-l-gray-300 bg-muted text-muted-foreground cursor-pointer transition-all duration-150 hover:translate-y-px hover:text-primary hover:border-t-gray-600 hover:border-r-gray-600 hover:border-b-gray-500 hover:border-l-gray-500 hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] focus-visible:outline-2 focus-visible:outline-primary">
        <User aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
        {/* O corte fica no span interno: sm:not-sr-only volta overflow para visible e anularia o truncate. */}
        <span className="sr-only sm:not-sr-only min-w-0 text-[15px] font-medium"><span className="block max-w-40 truncate">{name.trim().split(/\s+/)[0]}</span></span>
      </button>
      {open && (
        <div id={id} className={`fixed left-0 right-0 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:pt-2 ${panelDemo ? "sm:w-64" : "sm:w-44"}`}>
          <nav aria-label="Menu da conta" className="overflow-hidden border-y border-border bg-card text-[15px] shadow-xl sm:rounded-sm sm:border">
            <Link to="/minha-conta" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Minha Conta</Link>
            {role === "ADMIN" && <Link to="/manager" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Painel Administrativo</Link>}
            <Link to="/favoritos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Favoritos</Link>
            {role === "USER" && <Link to="/meus-pedidos" onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-muted focus-visible:bg-muted">Meus Pedidos</Link>}
            {panelDemo && <Link to="/manager" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 hover:bg-muted focus-visible:bg-muted">Painel administrativo (demo)</Link>}
            <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="w-full text-left px-4 py-3 hover:bg-muted focus-visible:bg-muted">Sair</button>
          </nav>
        </div>
      )}
    </div>
  );
}
