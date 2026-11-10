import type { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { registerUniqueEmail } from "../lib/account-registration.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { updateAccountSchema, changePasswordSchema } from "../schemas/account.schema.js";

const select = { id: true, name: true, email: true, phone: true, address: {
    select: { cep: true, street: true, number: true, complement: true, neighborhood: true, city: true, state: true }
} } as const;
function profile(user: NonNullable<Awaited<ReturnType<typeof getRecord>>>) {
    const { address, ...account } = user;
    return { account: { ...account, role: "USER" as const }, address };
}
const getRecord = (id: number) => prisma.user.findUnique({ where: { id }, select });
export async function getProfile(id: number) {
    const user = await getRecord(id);
    return user ? profile(user) : null;
}
export async function updateProfile(id: number, input: z.infer<typeof updateAccountSchema>) {
    return registerUniqueEmail(input.email, async tx => {
        if (input.address) await tx.userAddress.upsert({ where: { userId: id }, create: { userId: id, ...input.address }, update: input.address });
        else await tx.userAddress.deleteMany({ where: { userId: id } });
        return profile(await tx.user.update({ where: { id }, data: { email: input.email, ...(input.phone !== undefined ? { phone: input.phone } : {}) }, select }));
    }, id);
}
// Resultado da troca de senha, igual para cliente e admin (o controller traduz em resposta HTTP).
export type PasswordChangeResult = "changed" | "wrong-current" | "same-as-current";

// Regra única da troca de senha (PUT /conta/senha e PUT /conta/admin/senha). O schema (regras e
// confirmação) já foi validado no controller; aqui, nesta ordem:
//   1. a senha atual precisa bater com o hash guardado;
//   2. a nova senha não pode bater com esse MESMO hash (argon2id, verifyPassword) — não basta comparar
//      com o campo currentPassword enviado. Como (1) vem antes, quem não sabe a senha atual nunca
//      recebe o aviso (2) e não descobre nada sobre a senha guardada.
// A gravação só acontece se o hash ainda for o lido: uma troca concorrente não é sobrescrita.
async function replacePassword(storedHash: string | undefined, input: z.infer<typeof changePasswordSchema>,
    write: (passwordHash: string, expectedHash: string) => Promise<{ count: number }>): Promise<PasswordChangeResult> {
    if (!storedHash || !await verifyPassword(storedHash, input.currentPassword)) return "wrong-current";
    if (await verifyPassword(storedHash, input.newPassword)) return "same-as-current";
    const updated = await write(await hashPassword(input.newPassword), storedHash);
    return updated.count === 1 ? "changed" : "wrong-current";
}

export async function changePassword(id: number, input: z.infer<typeof changePasswordSchema>) {
    const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
    return replacePassword(user?.passwordHash, input, (passwordHash, expectedHash) =>
        prisma.user.updateMany({ where: { id, passwordHash: expectedHash }, data: { passwordHash } }));
}

const adminSelect = { id: true, email: true } as const;
function adminAccount(admin: { id: number; email: string }) {
    return { id: admin.id, name: admin.email.split("@")[0]!, email: admin.email, role: "ADMIN" as const };
}
export async function getAdminProfile(id: number) {
    const admin = await prisma.admin.findUnique({ where: { id }, select: adminSelect });
    return admin ? { account: adminAccount(admin) } : null;
}
export async function updateAdminEmail(id: number, email: string) {
    return registerUniqueEmail(email, async tx => {
        const admin = await tx.admin.update({ where: { id }, data: { email }, select: adminSelect });
        return { account: adminAccount(admin) };
    }, undefined, id);
}
export async function changeAdminPassword(id: number, input: z.infer<typeof changePasswordSchema>) {
    const admin = await prisma.admin.findUnique({ where: { id }, select: { passwordHash: true } });
    return replacePassword(admin?.passwordHash, input, (passwordHash, expectedHash) =>
        prisma.admin.updateMany({ where: { id, passwordHash: expectedHash }, data: { passwordHash } }));
}
