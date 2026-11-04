
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        "DATABASE_URL must be explicitly set in the process environment; .env files are not loaded by the application.",
    );
}

const databaseUrl = new URL(connectionString);
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

const localHosts = ["localhost", "127.0.0.1", "::1"];
const isLocal = localHosts.includes(databaseUrl.hostname);

const expectedNeonHost =
    "ep-purple-credit-b65gneg7.c-2.sa-east-1.aws.neon.tech";

const isAuthorizedRemoteDemo =
    process.env.NODE_ENV === "production" &&
    process.env.MCD_DEMO_ALLOW_REMOTE_DATABASE === "1" &&
    databaseUrl.hostname === expectedNeonHost &&
    databaseName === "neondb" &&
    ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
    ["require", "verify-full"].includes(
        databaseUrl.searchParams.get("sslmode") ?? "",
    );

if (process.env.NODE_ENV === "test") {
    const allowedTestDatabase =
        /^mcd_store_test_[0-9a-f]{32}$/i.test(databaseName) ||
        (Boolean(process.env.CI) && databaseName === "mcd_store_ci");

    if (!isLocal || !allowedTestDatabase) {
        throw new Error(
            "Tests may connect only to a local isolated MCD Store test database.",
        );
    }
} else if (process.env.NODE_ENV === "production") {
    const localDemo = isLocal && databaseName === "mcd_store_demo";

    if (!localDemo && !isAuthorizedRemoteDemo) {
        throw new Error(
            "Refusing database connection outside the authorized MCD Store demonstration database.",
        );
    }
} else if (!isLocal || databaseName !== "mcd_store_demo") {
    throw new Error(
        "Local application may connect only to local database mcd_store_demo.",
    );
}

const adapter = new PrismaPg({
    connectionString,
});

export const prisma = new PrismaClient({
    adapter,
});
