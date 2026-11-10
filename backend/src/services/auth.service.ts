import { decodeJwt } from "jose";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { lifetimeFor, signAccountToken } from "../lib/token.js";
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
    // A conta demonstrativa não entra pelo login normal (mesma resposta genérica de credenciais inválidas).
    if (!record || !validPassword || !record.active || (admin && user) || admin?.isDemo) return null;

    const account: Account = admin
        ? { id: admin.id, name: admin.email.split("@")[0]!, email: admin.email, role: "ADMIN" }
        : { id: user!.id, name: user!.name, email: user!.email, role: "USER" };
    return session(account, admin ? { admin: { id: admin.id, email: admin.email } } : {});
}

async function session(account: Account, extra: Record<string, unknown> = {}) {
    const accessToken = await signAccountToken(account.id, account.role);
    return {
        accessToken,
        expiresAt: decodeJwt(accessToken).exp! * 1000,
        tokenType: "Bearer",
        expiresIn: lifetimeFor(account.role),
        account,
        ...extra
    };
}

const DEMO_NAME = "Visitante (demo)";
// Sessão demonstrativa: sem credenciais vindas do front; usa a conta isDemo ativa.
export async function demoLogin() {
    const demo = await prisma.admin.findFirst({ where: { isDemo: true, active: true }, orderBy: { id: "asc" }, select: { id: true, email: true } });
    if (!demo) return null;
    return session({ id: demo.id, name: DEMO_NAME, email: demo.email, role: "DEMO" });
}

export async function getAccount(identity: TokenIdentity): Promise<{ account: Account; active: boolean } | null> {
    if (identity.role === "ADMIN" || identity.role === "DEMO") {
        const admin = await prisma.admin.findUnique({
            where: { id: identity.id }, select: { id: true, email: true, active: true, isDemo: true }
        });
        // O papel do token precisa bater com a conta: token ADMIN não vale para a conta demo e vice-versa.
        if (!admin || admin.isDemo !== (identity.role === "DEMO")) return null;
        return identity.role === "DEMO"
            ? { account: { id: admin.id, name: DEMO_NAME, email: admin.email, role: "DEMO" }, active: admin.active }
            : { account: { id: admin.id, name: admin.email.split("@")[0]!, email: admin.email, role: "ADMIN" }, active: admin.active };
    }
    const user = await prisma.user.findUnique({
        where: { id: identity.id }, select: { id: true, name: true, email: true, active: true }
    });
    return user ? {
        account: { id: user.id, name: user.name, email: user.email, role: "USER" },
        active: user.active
    } : null;
}
