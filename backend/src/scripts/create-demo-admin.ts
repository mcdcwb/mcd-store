
import { createAdminSchema } from "../schemas/admin.schema.js";
import { createAdmin } from "../services/admin.service.js";

const expectedHost = "ep-purple-credit-b65gneg7.c-2.sa-east-1.aws.neon.tech";
const expectedDatabase = "neondb";

function validateEnvironment() {
    if (process.env.NODE_ENV !== "production") {
        throw new Error("Este script só pode ser executado em produção.");
    }

    if (process.env.MCD_DEMO_ALLOW_REMOTE_DATABASE !== "1") {
        throw new Error("A autorização para o banco remoto não está habilitada.");
    }

    if (process.env.ALLOW_DEMO_ADMIN_BOOTSTRAP !== "1") {
        throw new Error("A autorização explícita para criar o administrador não foi fornecida.");
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL não foi definida no ambiente do processo.");
    }

    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.slice(1));

    if (url.hostname !== expectedHost || database !== expectedDatabase) {
        throw new Error("Conexão recusada: o banco não corresponde ao Neon autorizado para a demonstração.");
    }

    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
        throw new Error("Protocolo de conexão inválido.");
    }

    if (url.searchParams.get("sslmode") !== "require" &&
        url.searchParams.get("sslmode") !== "verify-full") {
        throw new Error("A conexão com o banco remoto precisa exigir SSL.");
    }
}

async function main() {
    validateEnvironment();

    const input = createAdminSchema.safeParse({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
    });

    if (!input.success) {
        throw new Error("Informe um ADMIN_EMAIL válido e um ADMIN_PASSWORD com 5 a 128 caracteres.");
    }

    const { prisma } = await import("../lib/prisma.js");

    try {
        await createAdmin(input.data);
        console.info("Administrador da demonstração criado com sucesso.");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error: unknown) => {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
    ) {
        console.error("Já existe um administrador com esse e-mail.");
    } else {
        console.error(
            error instanceof Error
                ? error.message
                : "Não foi possível criar o administrador."
        );
    }

    process.exitCode = 1;
});
