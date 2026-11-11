import { z } from "zod";
import { adminEmailSchema } from "./admin.schema.js";
import { passwordSchema } from "./password.schema.js";

export const loginSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(1).max(128)
});

// Regra de senha (registerSchema.password = passwordSchema, de password.schema.ts) usada no cadastro de
// cliente e reaproveitada por changePasswordSchema (troca de senha do cliente e do admin, PUT /conta/senha e
// PUT /conta/admin/senha) e por createAdminSchema (criação de admin: seed:admin, admin:create).
// ATENÇÃO: mantenha estas regras IGUAIS às de src/app/lib/password-rules.ts (front), que mostra os
// requisitos ao vivo. Se mudar uma, mude a outra no mesmo commit.
export const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: adminEmailSchema,
    password: passwordSchema
}).strict();

// Corpo do POST /auth/register: os campos do registerSchema (mesma regra de senha) + a confirmação,
// que precisa ser igual à senha. A confirmação só é conferida aqui; createUser recebe registerSchema
// (sem ela), então nunca é gravada.
export const REGISTER_CONFIRMATION_MESSAGE = "A confirmação da senha não confere.";
export const registerRequestSchema = registerSchema.extend({
    confirmPassword: z.string({ error: REGISTER_CONFIRMATION_MESSAGE }).max(128)
}).strict().refine(data => data.confirmPassword === data.password, { message: REGISTER_CONFIRMATION_MESSAGE, path: ["confirmPassword"] });
