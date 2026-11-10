import { Fragment, useId } from "react";
import { PasswordRequirements } from "./PasswordRequirements";
import { PASSWORD_MAX_LENGTH, SAME_PASSWORD_MESSAGE, passwordChangeState, type PasswordChangeValues } from "../lib/password-rules";

// Campos de ALTERAR senha (Senha atual, Nova senha, Confirmar nova senha), compartilhados pela
// Minha Conta da loja e do painel: avisos ao vivo, ligações de acessibilidade e a lista de requisitos.
// Cada tela mantém o próprio <form>, botão de salvar (use passwordChangeState(values).ready) e estilo
// dos campos (inputClass).
// - "A nova senha precisa ser diferente da senha atual." abaixo de "Nova senha" quando os campos são
//   iguais, ou quando o servidor recusa pelo mesmo motivo (serverError igual à mensagem).
// - "As senhas não coincidem" abaixo da confirmação quando ela difere da nova.
// Mensagens fora do <label> (não entram no nome do campo), ligadas por aria-describedby.
const fields = [
  { key: "currentPassword", label: "Senha atual", autoComplete: "current-password", minLength: 1 },
  { key: "newPassword", label: "Nova senha", autoComplete: "new-password", minLength: 6 },
  { key: "confirmPassword", label: "Confirmar nova senha", autoComplete: "new-password", minLength: 6 },
] as const;

export const isSamePasswordError = (message: string) => message === SAME_PASSWORD_MESSAGE;

export function PasswordChangeFields({ values, onChange, inputClass, serverError = "" }: {
  values: PasswordChangeValues; onChange: (values: PasswordChangeValues) => void; inputClass: string; serverError?: string;
}) {
  const rulesId = useId(), sameId = useId(), mismatchId = useId();
  const { mismatch, sameAsCurrent } = passwordChangeState(values);
  const serverSame = isSamePasswordError(serverError);
  const showSame = sameAsCurrent || serverSame;
  return <>
    {fields.map(({ key, label, autoComplete, minLength }) => {
      const invalid = (key === "newPassword" && showSame) || (key === "confirmPassword" && mismatch);
      const describedBy = key === "newPassword" ? [showSame ? sameId : "", rulesId].filter(Boolean).join(" ")
        : key === "confirmPassword" && mismatch ? mismatchId : undefined;
      return <Fragment key={key}>
        <label className="block text-sm font-medium">{label}
          <input type="password" className={inputClass} autoComplete={autoComplete} minLength={minLength} maxLength={PASSWORD_MAX_LENGTH} required
            value={values[key]} aria-describedby={describedBy} aria-invalid={invalid ? true : undefined}
            onChange={event => onChange({ ...values, [key]: event.target.value })} />
        </label>
        {/* Aviso do servidor é anunciado (role="alert"); o aviso ao vivo não, para não repetir a cada tecla. */}
        {key === "newPassword" && showSame && <p id={sameId} role={serverSame && !sameAsCurrent ? "alert" : undefined} className="-mt-2 text-sm text-destructive">{SAME_PASSWORD_MESSAGE}</p>}
        {key === "confirmPassword" && mismatch && <p id={mismatchId} className="-mt-2 text-sm text-destructive">As senhas não coincidem</p>}
      </Fragment>;
    })}
    <PasswordRequirements id={rulesId} value={values.newPassword} currentPassword={values.currentPassword} className="text-sm" />
  </>;
}
