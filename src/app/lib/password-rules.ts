// Regras de senha mostradas na tela. Batem EXATAMENTE com o backend:
// registerSchema.password (cadastro de cliente) e changePasswordSchema (troca de senha do cliente e do
// admin): 6 a 128 caracteres, 1 letra maiúscula e 1 número. O limite de 128 fica no maxLength dos campos.
// ATENÇÃO: mantenha estas regras IGUAIS às de backend/src/schemas/auth.schema.ts (registerSchema.password).
// Se mudar uma, mude a outra no mesmo commit; senão a tela libera senhas que o servidor recusa (ou vice-versa).
export const PASSWORD_MAX_LENGTH = 128;
export const passwordRules = [
  { id: "length", label: "Mínimo de 6 caracteres", test: (value: string) => value.length >= 6 },
  { id: "uppercase", label: "Pelo menos 1 letra maiúscula", test: (value: string) => /[A-Z]/.test(value) },
  { id: "number", label: "Pelo menos 1 número", test: (value: string) => /[0-9]/.test(value) },
] as const;
export const passwordMeetsRules = (value: string) => value.length <= PASSWORD_MAX_LENGTH && passwordRules.every(rule => rule.test(value));

// Troca de senha (Minha Conta da loja e do painel): a nova precisa ser diferente da atual. O front avisa
// na hora comparando os dois campos; a regra que vale é a do backend, que compara a nova com o HASH
// guardado e responde 400 com esta mesma mensagem.
export const SAME_PASSWORD_MESSAGE = "A nova senha precisa ser diferente da senha atual.";
export const differentFromCurrentLabel = "Diferente da senha atual";
// Cumprido só com os dois campos preenchidos e diferentes; neutro se algum estiver vazio.
export const isDifferentFromCurrent = (newPassword: string, currentPassword: string) =>
  newPassword.length > 0 && currentPassword.length > 0 && newPassword !== currentPassword;
export type PasswordChangeValues = { currentPassword: string; newPassword: string; confirmPassword: string };
export const emptyPasswordChange: PasswordChangeValues = { currentPassword: "", newPassword: "", confirmPassword: "" };
// Estado do formulário de troca: o botão de salvar só habilita com a senha atual preenchida, os
// requisitos cumpridos, a confirmação igual e a nova diferente da atual.
export function passwordChangeState({ currentPassword, newPassword, confirmPassword }: PasswordChangeValues) {
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const ready = currentPassword.length > 0 && passwordMeetsRules(newPassword) && confirmPassword === newPassword && !sameAsCurrent;
  return { mismatch, sameAsCurrent, ready };
}
