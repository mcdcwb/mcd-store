import { z } from "zod";
import { adminEmailSchema } from "./admin.schema.js";
import { passwordSchema } from "./password.schema.js";

export const loginSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(1).max(128)
});

// Regra de senha (registerSchema.password = passwordSchema, de password.schema.ts) usada no cadastro de
// cliente e reaproveitada por changePasswordSchema (troca de senha do cliente e do admin, PUT /conta/senha e
// PUT /conta/admin/senha) e por createAdminSchema (criação de admin: seed:admin, seed:demo-admin, admin:create).
// ATENÇÃO: mantenha estas regras IGUAIS às de src/app/lib/password-rules.ts (front), que mostra os
// requisitos ao vivo. Se mudar uma, mude a outra no mesmo commit.
export const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: adminEmailSchema,
    password: passwordSchema
}).strict();
