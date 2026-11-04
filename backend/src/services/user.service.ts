import type { z } from "zod";
import { hashPassword } from "../lib/password.js";
import { registerUniqueEmail } from "../lib/account-registration.js";
import { registerSchema } from "../schemas/auth.schema.js";

export async function createUser(input: z.infer<typeof registerSchema>) {
    const { name, email, password } = registerSchema.parse(input);
    const passwordHash = await hashPassword(password);
    return registerUniqueEmail(email, tx => tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true, name: true, email: true }
    }));
}
