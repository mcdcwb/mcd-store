import { decodeJwt } from "jose";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccountToken, tokenLifetimeSeconds } from "../lib/token.js";
import type { loginSchema } from "../schemas/auth.schema.js";
import type { Account, TokenIdentity } from "../types/auth.js";

const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

export async function login(input: z.infer<typeof loginSchema>) {
    const [admin, user] = await Promise.all([
        prisma.admin.findUnique({ where: { email: input.email } }),
        prisma.user.findUnique({ where: { email: input.email }, select: {
            id: true, name: true, email: true, passwordHash: true, active: true
        } })
    ]);
    const record = admin ?? user;
    const validPassword = await verifyPassword(record?.passwordHash ?? await dummyPasswordHash, input.password);
    // Fail closed if data inserted outside the registration services is ambiguous.
    if (!record || !validPassword || !record.active || (admin && user)) return null;

    const account: Account = admin
        ? { id: admin.id, name: admin.email.split("@")[0]!, email: admin.email, role: "ADMIN" }
        : { id: user!.id, name: user!.name, email: user!.email, role: "USER" };
    const accessToken = await signAccountToken(account.id, account.role);
    return {
        accessToken,
        expiresAt: decodeJwt(accessToken).exp! * 1000,
        tokenType: "Bearer",
        expiresIn: tokenLifetimeSeconds,
        account,
        ...(admin ? { admin: { id: admin.id, email: admin.email } } : {})
    };
}

export async function getAccount(identity: TokenIdentity): Promise<{ account: Account; active: boolean } | null> {
    if (identity.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
            where: { id: identity.id }, select: { id: true, email: true, active: true }
        });
        return admin ? {
            account: { id: admin.id, name: admin.email.split("@")[0]!, email: admin.email, role: "ADMIN" },
            active: admin.active
        } : null;
    }
    const user = await prisma.user.findUnique({
        where: { id: identity.id }, select: { id: true, name: true, email: true, active: true }
    });
    return user ? {
        account: { id: user.id, name: user.name, email: user.email, role: "USER" },
        active: user.active
    } : null;
}
