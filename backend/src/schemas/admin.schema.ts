import { z } from "zod";

export const adminEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const createAdminSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(5).max(128)
});
