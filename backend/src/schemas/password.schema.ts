import { z } from "zod";

// Regra ÚNICA de senha nova, usada em todos os fluxos que definem senha:
// - cadastro de cliente (registerSchema.password, POST /auth/register);
// - troca de senha do cliente e do admin (changePasswordSchema, PUT /conta/senha e PUT /conta/admin/senha);
// - criação de admin (createAdminSchema: seed:admin, seed:demo-admin, admin:create).
// Fica num arquivo próprio para evitar import circular entre auth.schema.ts e admin.schema.ts.
// ATENÇÃO: mantenha estas regras IGUAIS às de src/app/lib/password-rules.ts (front), que mostra os
// requisitos ao vivo. Se mudar uma, mude a outra no mesmo commit.
export const passwordSchema = z.string()
    .min(6, "A senha deve ter no mínimo 6 caracteres.")
    .max(128, "A senha deve ter no máximo 128 caracteres.")
    .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula.")
    .regex(/[0-9]/, "A senha deve conter pelo menos um número.");

// Texto para mensagens de scripts/CLI.
export const passwordRequirementsText = "de 6 a 128 caracteres, com pelo menos 1 letra maiúscula e 1 número";
