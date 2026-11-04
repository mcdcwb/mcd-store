import { z } from "zod";
import { adminEmailSchema } from "./admin.schema.js";
import { registerSchema } from "./auth.schema.js";

const text = (max: number) => z.string().trim().min(1).max(max);
export const addressSchema = z.object({
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/).transform(value => value.replace("-", "")),
    street: text(200), number: text(20), complement: z.string().trim().max(100).default(""),
    neighborhood: text(100), city: text(100),
    state: z.string().trim().toUpperCase().refine(value => ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].includes(value), "UF inválida.")
}).strict();
export const updateAccountSchema = z.object({
    email: adminEmailSchema,
    address: addressSchema.nullable(),
    phone: z.string().trim().max(40).nullable().optional()
}).strict();
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: registerSchema.shape.password,
    confirmPassword: registerSchema.shape.password
}).strict().refine(data => data.newPassword === data.confirmPassword, { message: "A confirmação da nova senha não confere.", path: ["confirmPassword"] });
