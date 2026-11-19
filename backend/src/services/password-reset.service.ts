import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { sendPasswordResetMail } from "../lib/mailer.js";

// Recuperação de senha de cliente (USER) por e-mail.
// - Token: 32 bytes aleatórios (crypto) em base64url, enviado só no link do e-mail.
// - Banco: guarda apenas o hash SHA-256; vale 30 minutos e uma única vez.
// - Novo pedido invalida (apaga) os tokens anteriores da mesma conta.
// - Redefinir troca a senha, marca o token como usado e grava passwordChangedAt, que encerra
//   as sessões (JWT) emitidas antes, o mesmo mecanismo da troca de senha em Minha Conta.
export const RESET_TOKEN_MINUTES = 30;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_MINUTES * 60 * 1000;
export const resetTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class PasswordResetConfigError extends Error {}

// Link para a tela /redefinir-senha: primeira origem de FRONTEND_ORIGIN (pode ter várias, separadas
// por vírgula). Fora de produção, sem a variável, usa o Vite local.
export function resetLink(token: string) {
    const origin = (process.env.FRONTEND_ORIGIN ?? "").split(",").map(value => value.trim().replace(/\/$/, "")).find(Boolean)
        ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5173");
    if (!origin) throw new PasswordResetConfigError("FRONTEND_ORIGIN não configurado.");
    return `${origin}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export async function requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, active: true } });
    if (!user || !user.active) return;
    const token = randomBytes(32).toString("base64url");
    const link = resetLink(token);
    await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) } })
    ]);
    await sendPasswordResetMail(user.email, user.name, link, RESET_TOKEN_MINUTES);
}

export type PasswordResetResult = "reset" | "invalid" | "same-as-current";

export async function resetPassword(token: string, newPassword: string): Promise<PasswordResetResult> {
    if (!resetTokenPattern.test(token)) return "invalid";
    const record = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
        select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { passwordHash: true, active: true } } }
    });
    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.active) return "invalid";
    // Mesma regra da troca de senha; o token continua valendo para tentar outra senha.
    if (await verifyPassword(record.user.passwordHash, newPassword)) return "same-as-current";
    const passwordHash = await hashPassword(newPassword);
    return prisma.$transaction(async tx => {
        // Uso único mesmo com dois envios simultâneos: só um consegue marcar o token como usado.
        const now = new Date();
        const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
        if (claimed.count !== 1) return "invalid";
        await tx.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: now } });
        await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
        return "reset";
    });
}
