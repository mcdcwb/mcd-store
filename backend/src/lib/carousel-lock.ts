import type { Prisma } from "../generated/prisma/client.js";

export async function lockCarouselSelection(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(29092026, 1)::text`;
}
