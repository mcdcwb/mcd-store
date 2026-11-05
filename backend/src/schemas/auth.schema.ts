import { z } from "zod";
import { adminEmailSchema } from "./admin.schema.js";

export const loginSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(1).max(128)
});

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: adminEmailSchema,
    password: z.string()
        .min(6, "A senha deve ter no mínimo 6 caracteres.")
        .max(128, "A senha deve ter no máximo 128 caracteres.")
        .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula.")
        .regex(/[0-9]/, "A senha deve conter pelo menos um número.")
}).strict();
