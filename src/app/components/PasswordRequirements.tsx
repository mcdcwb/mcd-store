import { Check } from "lucide-react";
import { differentFromCurrentLabel, isDifferentFromCurrent, passwordRules } from "../lib/password-rules";

// Lista de requisitos de senha com validação ao vivo, compartilhada entre o cadastro da loja (AuthModal)
// e a troca de senha (Minha Conta da loja e do painel). Ligue ao campo com aria-describedby={id}.
// Cumprido: check verde. Não cumprido (ou campo vazio): neutro, nunca vermelho.
// O estado também vai em texto oculto ("cumprido"/"não cumprido"), sem depender só da cor.
// currentPassword: só nos formulários de ALTERAR senha; acrescenta "Diferente da senha atual".
export function PasswordRequirements({ id, value, currentPassword, className = "" }: { id: string; value: string; currentPassword?: string; className?: string }) {
  const items: { id: string; label: string; met: boolean }[] = passwordRules.map(rule => ({ id: rule.id, label: rule.label, met: value.length > 0 && rule.test(value) }));
  if (currentPassword !== undefined) items.push({ id: "different", label: differentFromCurrentLabel, met: isDifferentFromCurrent(value, currentPassword) });
  return <ul id={id} aria-label="Requisitos da senha" className={`space-y-1 text-xs ${className}`}>
    {items.map(({ id: itemId, label, met }) => <li key={itemId} data-met={met} className={`flex items-center gap-1.5 transition-colors motion-reduce:transition-none ${met ? "text-emerald-700 dark:text-emerald-400 [[data-store-theme=dark]_&]:text-emerald-300" : "text-muted-foreground"}`}>
      <span aria-hidden="true" className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border ${met ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500" : "border-muted-foreground/40"}`}>
        {met && <Check size={10} strokeWidth={3} />}
      </span>
      {label}<span className="sr-only">{met ? ": cumprido" : ": não cumprido"}</span>
    </li>)}
  </ul>;
}
