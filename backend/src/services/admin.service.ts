import type { z } from "zod";
import { registerUniqueEmail } from "../lib/account-registration.js";
import { hashPassword } from "../lib/password.js";
import { createAdminSchema } from "../schemas/admin.schema.js";

export async function createAdmin(input: z.infer<typeof createAdminSchema>) {
    const { email, password } = createAdminSchema.parse(input);
    const passwordHash = await hashPassword(password);
    return registerUniqueEmail(email, tx => tx.admin.create({
        data: { email, passwordHash },
        select: { id: true, email: true, active: true, createdAt: true }
    }));
}
