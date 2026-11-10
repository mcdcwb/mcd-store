
import { createAdminSchema } from "../schemas/admin.schema.js";
import { passwordRequirementsText } from "../schemas/password.schema.js";
import { createAdmin } from "../services/admin.service.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error(
        "DATABASE_URL must be explicitly set in the process environment.",
    );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
const localHosts = ["localhost", "127.0.0.1", "::1"];
const localHost = localHosts.includes(parsedDatabaseUrl.hostname);

const allowedDatabase =
    process.env.NODE_ENV === "test"
        ? /^mcd_store_test_[0-9a-f]{32}$/i.test(databaseName)
        : process.env.NODE_ENV !== "production" &&
        databaseName === "mcd_store_demo";

if (!localHost || !allowedDatabase) {
    throw new Error(
        "Admin creation is allowed only on local MCD Store demo or isolated test databases.",
    );
}

const { prisma } = await import("../lib/prisma.js");

try {
    const input = createAdminSchema.safeParse({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
    });

    if (!input.success) {
        console.error(
            `Defina ADMIN_EMAIL válido e ADMIN_PASSWORD ${passwordRequirementsText} (mesma regra do cadastro de clientes).`,
        );
        for (const issue of input.error.issues) console.error(`  - ${issue.path.join(".") || "valor"}: ${issue.message}`);
        process.exitCode = 1;
    } else {
        await createAdmin(input.data);
        console.log("Administrador criado com sucesso.");
    }
} catch (error) {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
    ) {
        console.error("Já existe um administrador com este e-mail.");
    } else {
        console.error(
            "Não foi possível criar o administrador. Verifique a conexão e as migrations.",
        );
    }
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
