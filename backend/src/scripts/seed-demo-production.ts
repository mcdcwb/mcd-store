
const expectedHost =
    "ep-purple-credit-b65gneg7.c-2.sa-east-1.aws.neon.tech";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL não foi definida.");
}

const url = new URL(connectionString);
const databaseName = decodeURIComponent(url.pathname.slice(1));

const authorized =
    process.env.NODE_ENV === "production" &&
    process.env.MCD_DEMO_ALLOW_REMOTE_DATABASE === "1" &&
    url.hostname === expectedHost &&
    databaseName === "neondb" &&
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["require", "verify-full"].includes(
        url.searchParams.get("sslmode") ?? "",
    );

if (!authorized) {
    throw new Error(
        "Execução recusada: banco remoto não autorizado para o seed.",
    );
}

const { prisma } = await import("../lib/prisma.js");
const { seedDevelopmentProducts, seedWhere } =
    await import("../lib/development-products.js");

try {
    const [database] = await prisma.$queryRaw<
        { name: string }[]
    >`SELECT current_database() AS name`;

    if (database?.name !== "neondb") {
        throw new Error("Banco conectado diferente do esperado.");
    }

    const before = {
        products: await prisma.product.count(),
        seedProducts: await prisma.product.count({
            where: seedWhere,
        }),
        users: await prisma.user.count(),
        admins: await prisma.admin.count(),
    };

    console.log("Banco autorizado:", database.name);
    console.log("Estado anterior:", before);

    const products = await seedDevelopmentProducts();

    const variants = products.reduce(
        (total, product) =>
            total +
            product.colors.reduce(
                (sum, color) => sum + color.variants.length,
                0,
            ),
        0,
    );

    const after = {
        products: await prisma.product.count(),
        seedProducts: await prisma.product.count({
            where: seedWhere,
        }),
        users: await prisma.user.count(),
        admins: await prisma.admin.count(),
    };

    if (products.length !== 12 || variants !== 50) {
        throw new Error(
            `Resultado inesperado: ${products.length} produtos e ${variants} variantes.`,
        );
    }

    if (
        before.users !== after.users ||
        before.admins !== after.admins
    ) {
        throw new Error(
            "A quantidade de contas foi alterada inesperadamente.",
        );
    }

    console.log(
        JSON.stringify(
            {
                success: true,
                database: database.name,
                productsSeeded: products.length,
                variantsSeeded: variants,
                before,
                after,
            },
            null,
            2,
        ),
    );
} catch (error) {
    console.error(
        error instanceof Error ? error.message : "Falha no seed remoto.",
    );
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
