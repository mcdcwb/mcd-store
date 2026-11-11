import { NewPasswordFields } from "./NewPasswordFields";
import { PASSWORD_MAX_LENGTH, SAME_PASSWORD_MESSAGE, type PasswordChangeValues } from "../lib/password-rules";

// Campos de ALTERAR senha (Senha atual, Nova senha, Confirmar nova senha), compartilhados pela
// Minha Conta da loja e do painel. A parte "nova senha + confirmação + requisitos" é a mesma do
// cadastro da loja (NewPasswordFields); aqui entra a senha atual, o item "Diferente da senha atual" e
// o aviso de senha igual (também quando o servidor recusa: serverError igual à mensagem).
// Cada tela mantém o próprio <form>, botão de salvar (use passwordChangeState(values).ready) e estilo
// dos campos (inputClass).
export const isSamePasswordError = (message: string) => message === SAME_PASSWORD_MESSAGE;

export function PasswordChangeFields({ values, onChange, inputClass, serverError = "" }: {
  values: PasswordChangeValues; onChange: (values: PasswordChangeValues) => void; inputClass: string; serverError?: string;
}) {
  return <>
    <label className="block text-sm font-medium">Senha atual
      <input type="password" className={inputClass} autoComplete="current-password" minLength={1} maxLength={PASSWORD_MAX_LENGTH} required
        value={values.currentPassword} onChange={event => onChange({ ...values, currentPassword: event.target.value })} />
    </label>
    <NewPasswordFields variant="wrapped" inputClass={inputClass} currentPassword={values.currentPassword} serverSame={isSamePasswordError(serverError)}
      password={{ label: "Nova senha", value: values.newPassword, onChange: newPassword => onChange({ ...values, newPassword }) }}
      confirmation={{ label: "Confirmar nova senha", value: values.confirmPassword, onChange: confirmPassword => onChange({ ...values, confirmPassword }) }} />
  </>;
}
