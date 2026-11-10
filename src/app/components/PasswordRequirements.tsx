import { Check } from "lucide-react";
import { passwordRules } from "../lib/password-rules";

// Lista de requisitos de senha com validação ao vivo, compartilhada entre o cadastro da loja (AuthModal)
// e a troca de senha do painel (Minha Conta). Ligue ao campo com aria-describedby={id}.
// Cumprido: check verde. Não cumprido (ou campo vazio): neutro, nunca vermelho.
// O estado também vai em texto oculto ("cumprido"/"não cumprido"), sem depender só da cor.
export function PasswordRequirements({ id, value, className = "" }: { id: string; value: string; className?: string }) {
  return <ul id={id} aria-label="Requisitos da senha" className={`space-y-1 text-xs ${className}`}>
    {passwordRules.map(rule => {
      const met = value.length > 0 && rule.test(value);
      return <li key={rule.id} data-met={met} className={`flex items-center gap-1.5 transition-colors motion-reduce:transition-none ${met ? "text-emerald-700 dark:text-emerald-400 [[data-store-theme=dark]_&]:text-emerald-300" : "text-muted-foreground"}`}>
        <span aria-hidden="true" className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border ${met ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500" : "border-muted-foreground/40"}`}>
          {met && <Check size={10} strokeWidth={3} />}
        </span>
        {rule.label}<span className="sr-only">{met ? ": cumprido" : ": não cumprido"}</span>
      </li>;
    })}
  </ul>;
}
