import { z } from "zod";
import { adminEmailSchema } from "./admin.schema.js";

export const loginSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(1).max(128)
});

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: adminEmailSchema,
    password: z.string().min(5).max(128)
}).strict();
