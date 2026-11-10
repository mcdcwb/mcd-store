// Remove do banco LOCAL o usuário de demonstração e todos os dados dele.
// Lê DATABASE_URL somente da variável de ambiente do terminal (nenhum .env é carregado).
// Nunca imprime a URL.

const DEMO_EMAIL = "teste@mcdstore.com";

function abort(reason: string): never {
    console.error(`[reset] ABORTADO: ${reason}. Nada foi apagado.`);
    process.exit(1);
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) abort("DATABASE_URL não está definida no ambiente do terminal");
if (process.env.NODE_ENV) abort("NODE_ENV precisa estar vazio");
if (/neon/i.test(rawUrl)) abort("DATABASE_URL contém \"neon\"");

let url: URL;
try {
    url = new URL(rawUrl);
} catch {
    abort("DATABASE_URL inválida");
}
if (!["postgres:", "postgresql:"].includes(url.protocol)) abort("DATABASE_URL não é PostgreSQL");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) abort("DATABASE_URL não aponta para localhost/127.0.0.1");
const database = decodeURIComponent(url.pathname.slice(1));
if (database !== "mcd_store_demo") abort("o banco precisa ser mcd_store_demo");

// Só importa o Prisma do backend depois de todas as verificações.
// O próprio backend/src/lib/prisma.ts repete a checagem de banco local.
const { prisma } = await import("../backend/src/lib/prisma.ts");

try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
    if (!user) {
        console.log(`[reset] Usuário ${DEMO_EMAIL} não existe. Nada a fazer.`);
    } else {
        const result = await prisma.$transaction(async tx => {
            const orders = await tx.order.findMany({ where: { userId: user.id }, select: { id: true } });
            const orderIds = orders.map(order => order.id);
            const statusEvents = await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
            const orderItems = await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
            const deletedOrders = await tx.order.deleteMany({ where: { userId: user.id } });
            const cartItems = await tx.cartItem.deleteMany({ where: { userId: user.id } });
            const favorites = await tx.favorite.deleteMany({ where: { userId: user.id } });
            const addresses = await tx.userAddress.deleteMany({ where: { userId: user.id } });
            await tx.user.delete({ where: { id: user.id } });
            return { statusEvents: statusEvents.count, orderItems: orderItems.count, orders: deletedOrders.count,
                cartItems: cartItems.count, favorites: favorites.count, addresses: addresses.count };
        });
        console.log(`[reset] Usuário ${DEMO_EMAIL} removido:`, result);
    }
} finally {
    await prisma.$disconnect();
}
