const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be explicitly set in the process environment.");
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (!(["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)) || databaseName !== "mcd_store_demo") {
    throw new Error("Seed allowed only on local database mcd_store_demo.");
}
if (process.env.NODE_ENV === "production") throw new Error("Seed is disabled in production.");
const { prisma } = await import("../src/lib/prisma.js");
import { seedDevelopmentProducts, seedWhere } from "../src/lib/development-products.js";

try {
    const [database] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (process.env.NODE_ENV === "production" || database?.name !== "mcd_store_demo") {
        throw new Error("Seed permitido apenas em desenvolvimento no banco mcd_store_demo.");
    }
    const before = { users: await prisma.user.count(), admins: await prisma.admin.count() };
    const otherProductsBefore = await prisma.product.count({
        where: { OR: [{ description: null }, { NOT: seedWhere }] }
    });
    await seedDevelopmentProducts();
    // Read persisted data after the transaction commits.
    const products = await prisma.product.findMany({ where: seedWhere, include: { category: true, colors: { include: { variants: true } } } });
    const countBy = (field: "category" | "public") => products.reduce<Record<string, number>>((counts, product) => {
        const value = field === "category" ? product.category.name : product.public;
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {});
    console.log(JSON.stringify({
        database: database.name,
        products: products.length,
        variants: products.reduce((sum, product) => sum + product.colors.reduce((n, c) => n + c.variants.length, 0), 0),
        categories: countBy("category"),
        publics: countBy("public"),
        accountsBefore: before,
        accountsAfter: { users: await prisma.user.count(), admins: await prisma.admin.count() },
        otherProductsBefore,
        otherProductsAfter: await prisma.product.count({
            where: { OR: [{ description: null }, { NOT: seedWhere }] }
        })
    }, null, 2));
} catch (error) {
    console.error(error instanceof Error ? error.message : "Falha ao executar seed.");
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
