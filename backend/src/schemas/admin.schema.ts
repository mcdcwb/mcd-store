import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

export const adminEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// Criação de admin usa a MESMA regra de senha do cadastro de clientes (registerSchema.shape.password
// é este mesmo passwordSchema; importá-lo de auth.schema.ts criaria um import circular).
export const createAdminSchema = z.object({
    email: adminEmailSchema,
    password: passwordSchema
});
