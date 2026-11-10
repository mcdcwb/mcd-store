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
