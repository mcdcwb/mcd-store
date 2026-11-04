import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

export class EmailInUseError extends Error {
    readonly code = "P2002";
    constructor() { super("E-mail já cadastrado."); }
}

function isTransactionConflict(error: unknown) {
    if (!error || typeof error !== "object") return false;
    if ("code" in error && error.code === "P2034") return true;
    return "cause" in error && typeof error.cause === "object" && error.cause !== null &&
        "kind" in error.cause && error.cause.kind === "TransactionWriteConflict";
}

// Both registration paths read both tables in the same serializable transaction.
// Retrying serialization conflicts prevents concurrent cross-table duplicates.
export async function registerUniqueEmail<T>(
    email: string, create: (tx: Prisma.TransactionClient) => Promise<T>, excludeUserId?: number, excludeAdminId?: number
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(async tx => {
                const admin = await tx.admin.findUnique({ where: { email }, select: { id: true } });
                const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
                if ((admin && admin.id !== excludeAdminId) || (user && user.id !== excludeUserId)) throw new EmailInUseError();
                return create(tx);
            }, { isolationLevel: "Serializable" });
        } catch (error) {
            if (isTransactionConflict(error)) {
                if (attempt < 5) continue;
                throw new EmailInUseError();
            }
            if (typeof error === "object" && error !== null && "code" in error) {
                if (error.code === "P2002") throw new EmailInUseError();
            }
            throw error;
        }
    }
}
