import { useId } from "react";
import { PasswordRequirements } from "./PasswordRequirements";
import { CONFIRMATION_MISMATCH_MESSAGE, PASSWORD_MAX_LENGTH, SAME_PASSWORD_MESSAGE, passwordConfirmationState } from "../lib/password-rules";

// Senha nova + confirmação + requisitos ao vivo, compartilhado pelo cadastro da loja (AuthModal) e pela
// troca de senha (PasswordChangeFields, Minha Conta da loja e do painel).
// - Lista de requisitos abaixo da confirmação, ligada ao campo da senha por aria-describedby.
// - "As senhas não coincidem" abaixo da confirmação, com aria-invalid e aria-describedby.
// - currentPassword (só na troca de senha): item "Diferente da senha atual" e, quando iguais (ou quando o
//   servidor recusa pelo mesmo motivo, serverSame), o aviso abaixo da nova senha.
// O layout de cada tela vem por `variant`: "wrapped" (rótulo envolvendo o campo, Minha Conta) ou
// "stacked" (rótulo acima do campo, modal de cadastro). Mensagens ficam fora do <label>.
type Field = { label: string; value: string; onChange: (value: string) => void; placeholder?: string };

export function NewPasswordFields({ password, confirmation, inputClass, variant, labelClass = "", currentPassword, serverSame = false }: {
  password: Field; confirmation: Field; inputClass: string; variant: "wrapped" | "stacked"; labelClass?: string;
  currentPassword?: string; serverSame?: boolean;
}) {
  const passwordId = useId(), confirmationId = useId(), rulesId = useId(), sameId = useId(), mismatchId = useId();
  const { mismatch } = passwordConfirmationState(password.value, confirmation.value);
  const sameAsCurrent = currentPassword !== undefined && password.value.length > 0 && password.value === currentPassword;
  const showSame = sameAsCurrent || (currentPassword !== undefined && serverSame);
  const stacked = variant === "stacked";
  const message = (id: string, text: string, role?: "alert") =>
    <p id={id} role={role} className={stacked ? "text-xs text-destructive" : "-mt-2 text-sm text-destructive"}>{text}</p>;
  const requirements = <PasswordRequirements id={rulesId} value={password.value} currentPassword={currentPassword} className={stacked ? "mt-1.5" : "text-sm"} />;

  const field = (id: string, { label, value, onChange, placeholder }: Field, describedBy: string | undefined, invalid: boolean) => {
    const input = <input id={stacked ? id : undefined} type="password" className={inputClass} autoComplete="new-password" minLength={6} maxLength={PASSWORD_MAX_LENGTH} required
      value={value} placeholder={placeholder} aria-describedby={describedBy} aria-invalid={invalid ? true : undefined}
      onChange={event => onChange(event.target.value)} />;
    return stacked ? <><label htmlFor={id} className={labelClass}>{label}</label>{input}</>
      : <label className="block text-sm font-medium">{label}{input}</label>;
  };
  const passwordField = field(passwordId, password, [showSame ? sameId : "", rulesId].filter(Boolean).join(" "), showSame);
  // O aviso do servidor é anunciado (role="alert"); o aviso ao vivo não, para não repetir a cada tecla.
  const sameMessage = showSame && message(sameId, SAME_PASSWORD_MESSAGE, serverSame && !sameAsCurrent ? "alert" : undefined);
  const confirmationField = field(confirmationId, confirmation, mismatch ? mismatchId : undefined, mismatch);
  const mismatchMessage = mismatch && message(mismatchId, CONFIRMATION_MISMATCH_MESSAGE);

  if (stacked) return <>
    <div className="space-y-1">{passwordField}{sameMessage}</div>
    <div className="space-y-1">{confirmationField}{mismatchMessage}{requirements}</div>
  </>;
  return <>{passwordField}{sameMessage}{confirmationField}{mismatchMessage}{requirements}</>;
}
