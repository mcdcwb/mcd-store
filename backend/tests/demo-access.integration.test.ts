import "./helpers/assert-isolated-database.js";
import { categoryRelation } from "./helpers/category.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { hashPassword } from "../src/lib/password.js";
import { decodeJwt } from "jose";
import { startTestServer } from "./helpers/http.js";
import { orderNumber } from "../src/lib/order-number.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const DEMO_MESSAGE = "Modo demonstração: alterações não são salvas.";

test("painel demonstrativo: somente leitura, dados de clientes reais mascarados e ADMIN com acesso total", async t => {
    const server = await startTestServer(createApp());
    const prefix = randomUUID();
    const adminEmail = `admin-${prefix}@example.test`, demoEmail = `demo-${prefix}@example.test`, customerEmail = `cliente-${prefix}@example.test`;
    const password = "DemoAccessA1-" + prefix;
    const ids: { product?: number; category?: number; orders: number[]; user?: number } = { orders: [] };
    try {
        await createAdmin({ email: adminEmail, password });
        await prisma.admin.create({ data: { email: demoEmail, passwordHash: await hashPassword(password), isDemo: true } });
        const customer = await createUser({ name: "Rodrigo Almeida Souza", email: customerEmail, password });
        ids.user = customer.id;
        const category = await prisma.category.create({ data: { name: `Demo ${prefix}`, normalizedName: `demo ${prefix}` } });
        ids.category = category.id;
        const product = await prisma.product.create({ data: { name: `Produto demo ${prefix}`, price: 50, public: "unissex", category: categoryRelation,
            colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "M", stock: 3 }] } } } }, include: { colors: { include: { variants: true } } } });
        ids.product = product.id;
        const variantId = product.colors[0]!.variants[0]!.id;
        const address = { cep: "80000000", street: "Rua Real", number: "123", complement: "ap 4", neighborhood: "Batel", city: "Curitiba", state: "PR" };
        const makeOrder = async (isDemo: boolean) => {
            const sequence = 900000 + Math.floor(Math.random() * 90000);
            const order = await prisma.order.create({ data: {
                number: orderNumber(sequence, new Date()), sequence, userId: customer.id, isDemo, status: "PENDING_CONFIRMATION", fulfillmentMethod: "DELIVERY",
                customerName: "Rodrigo Almeida Souza", customerPhone: "+55 41 99876-1234", deliveryAddress: address, total: 50,
                idempotencyKey: randomUUID(), requestHash: "test", whatsappUrl: "", whatsappMessage: "",
                items: { create: { variantId, originalVariantId: variantId, productName: product.name, colorName: "Preto", size: "M", quantity: 1, unitPrice: 50, subtotal: 50 } },
            } });
            ids.orders.push(order.id);
            return order.id;
        };
        const realOrder = await makeOrder(false), fictionalOrder = await makeOrder(true);

        const login = async (email: string) => (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken as string;
        const admin = await login(adminEmail);

        await t.test("a conta demo é recusada no login normal, com a resposta genérica", async () => {
            const response = await server.request("/auth/login", "POST", { email: demoEmail, password });
            assert.equal(response.status, 401);
            const wrong = await server.request("/auth/login", "POST", { email: demoEmail, password: password + "x" });
            assert.deepEqual(await response.json(), await wrong.json());
        });

        const customerToken = await login(customerEmail);
        await t.test("demo-login exige um cliente logado (token USER)", async () => {
            assert.equal((await server.request("/auth/demo-login", "POST")).status, 401);
            assert.equal((await server.request("/auth/demo-login", "POST", undefined, "token-invalido")).status, 401);
            assert.equal((await server.request("/auth/demo-login", "POST", undefined, admin)).status, 403);
        });
        const demoSession = await (await server.request("/auth/demo-login", "POST", undefined, customerToken)).json();
        const demo = demoSession.accessToken as string;
        await t.test("token DEMO não abre outra sessão demo; a conta do cliente não muda", async () => {
            assert.equal((await server.request("/auth/demo-login", "POST", undefined, demo)).status, 403);
            const me = await (await server.request("/auth/me", "GET", undefined, customerToken)).json();
            assert.equal(me.account.role, "USER");
            assert.equal((await prisma.user.findUniqueOrThrow({ where: { email: customerEmail } })).email, customerEmail);
        });
        await t.test("demo-login entrega role DEMO, audience própria e sessão de 2h", async () => {
            assert.equal(demoSession.account.role, "DEMO");
            assert.equal(demoSession.account.name, "Visitante (demo)");
            const claims = decodeJwt(demo);
            assert.equal(claims.role, "DEMO"); assert.equal(claims.aud, "mcd-store-demo");
            assert.equal(claims.exp! - claims.iat!, 2 * 60 * 60);
            // Várias pessoas ao mesmo tempo: sessões independentes.
            assert.equal((await server.request("/auth/demo-login", "POST", undefined, customerToken)).status, 200);
        });

        await t.test("o DEMO lê todas as telas do painel", async () => {
            for (const path of ["/auth/me", "/produtos/admin", "/categorias", "/orders", `/orders/${realOrder}`, "/orders/reports",
                "/orders/reports?start=2026-01-01&end=2026-01-31&groupBy=day", "/orders/status-counts", "/settings", "/settings/store", "/conta/admin", "/favoritos"]) {
                assert.equal((await server.request(path, "GET", undefined, demo)).status, 200, `GET ${path}`);
            }
        });

        // TODAS as rotas de escrita da API (investigação) — mais uma rota inexistente, para provar que
        // o bloqueio é global e cobre rotas futuras.
        const writes: [string, string, unknown?][] = [
            ["POST", "/produtos", {}], ["PUT", `/produtos/${product.id}`, {}], ["DELETE", `/produtos/${product.id}`],
            ["PATCH", `/produtos/${product.id}/carrossel`, { inCarousel: true }], ["PATCH", "/produtos/carrossel/ordem", { productIds: [product.id] }],
            ["POST", "/categorias", { name: "Nova" }], ["PUT", `/categorias/${category.id}`, { name: "Outra" }], ["DELETE", `/categorias/${category.id}`],
            ["POST", `/orders/${realOrder}/confirm`, {}], ["POST", `/orders/${realOrder}/advance`, { expectedStatus: "PREPARING" }],
            ["POST", `/orders/${realOrder}/cancel`, { expectedStatus: "PENDING_CONFIRMATION" }], ["POST", `/orders/${realOrder}/archive`, {}],
            ["PUT", "/settings", { lowStockThreshold: 3, showLowStockBadge: true, showLastUnitBadge: true }], ["PUT", "/settings/store", { whatsapp: "41999999999" }],
            ["POST", "/uploads/produtos", {}],
            ["PATCH", "/conta/admin", { email: "outro@example.test" }], ["PUT", "/conta/admin/senha", { currentPassword: password, newPassword: "NovaSenha123", confirmPassword: "NovaSenha123" }],
            ["POST", "/favoritos", { productId: product.id }], ["DELETE", "/favoritos", { productId: product.id }],
            ["PUT", `/favoritos/${product.id}`], ["DELETE", `/favoritos/${product.id}`],
            ["PATCH", "/conta", {}], ["PUT", "/conta/senha", {}],
            ["POST", "/carrinho", {}], ["PATCH", "/carrinho", {}], ["DELETE", "/carrinho/item", {}], ["DELETE", "/carrinho"], ["POST", "/carrinho/sincronizar", { items: [] }],
            ["POST", "/checkout/whatsapp", {}],
            ["POST", "/rota-nova-que-ainda-nao-existe", {}], ["PATCH", "/orders/rota-futura", {}],
        ];
        await t.test("toda escrita feita pelo DEMO recebe 403 com a mensagem de demonstração", async () => {
            const escaped: string[] = [];
            for (const [method, path, body] of writes) {
                const response = await server.request(path, method, body, demo);
                const json = await response.json().catch(() => null);
                if (response.status !== 403 || json?.demo !== true || json?.message !== DEMO_MESSAGE) escaped.push(`${method} ${path} → ${response.status}`);
            }
            assert.deepEqual(escaped, [], "rotas de escrita sem bloqueio para o DEMO");
            // Nada mudou no banco.
            assert.ok(await prisma.product.findUnique({ where: { id: product.id } }));
            assert.equal((await prisma.category.findUnique({ where: { id: category.id } }))?.name, category.name);
            assert.equal((await prisma.order.findUnique({ where: { id: realOrder } }))?.status, "PENDING_CONFIRMATION");
            assert.equal((await prisma.productVariant.findUnique({ where: { id: variantId } }))?.stock, 3);
            assert.equal((await prisma.admin.findUnique({ where: { email: demoEmail } }))?.email, demoEmail);
        });

        await t.test("pedido de cliente real sai mascarado para o DEMO; fictício sai completo; ADMIN vê tudo", async () => {
            const masked = await (await server.request(`/orders/${realOrder}`, "GET", undefined, demo)).json();
            assert.equal(masked.privacyMasked, true);
            assert.equal(masked.customerName, "Rodrigo S.");
            assert.equal(masked.customerPhone, "(41) *****-1234");
            assert.deepEqual(masked.deliveryAddress, { cep: "", street: "", number: "", complement: "", neighborhood: "Batel", city: "Curitiba", state: "PR" });
            const list = await (await server.request(`/orders?search=${encodeURIComponent("Rodrigo")}&pageSize=50`, "GET", undefined, demo)).json();
            assert.equal(list.items.find((o: { id: number }) => o.id === realOrder)?.customerName, "Rodrigo S.");
            assert.equal(list.items.find((o: { id: number }) => o.id === fictionalOrder)?.customerName, "Rodrigo Almeida Souza");
            const fictional = await (await server.request(`/orders/${fictionalOrder}`, "GET", undefined, demo)).json();
            assert.equal(fictional.privacyMasked, false);
            assert.equal(fictional.customerPhone, "+55 41 99876-1234");
            assert.equal(fictional.deliveryAddress.street, "Rua Real");
            const full = await (await server.request(`/orders/${realOrder}`, "GET", undefined, admin)).json();
            assert.equal(full.customerName, "Rodrigo Almeida Souza"); assert.equal(full.deliveryAddress.street, "Rua Real"); assert.equal(full.privacyMasked, undefined);
        });

        await t.test("o ADMIN continua com acesso total às rotas de escrita do painel", async () => {
            // Corpos inválidos/ids inexistentes: a resposta é de validação (4xx), nunca 401/403.
            const adminWrites: [string, string, unknown?][] = [
                ["POST", "/produtos", {}], ["PUT", "/produtos/2147483000", {}], ["DELETE", "/produtos/2147483000"],
                ["PATCH", "/produtos/2147483000/carrossel", { inCarousel: true }], ["PATCH", "/produtos/carrossel/ordem", { productIds: "x" }],
                ["POST", "/categorias", {}], ["PUT", "/categorias/2147483000", {}], ["DELETE", "/categorias/2147483000"],
                ["POST", "/orders/2147483000/confirm", {}], ["POST", "/orders/2147483000/advance", {}], ["POST", "/orders/2147483000/cancel", {}], ["POST", "/orders/2147483000/archive", {}],
                ["PUT", "/settings", {}], ["PUT", "/settings/store", { whatsapp: 123 }], ["POST", "/uploads/produtos", {}],
                ["PATCH", "/conta/admin", {}], ["PUT", "/conta/admin/senha", {}], ["POST", "/favoritos", {}],
            ];
            const denied: string[] = [];
            for (const [method, path, body] of adminWrites) {
                const status = (await server.request(path, method, body, admin)).status;
                if (status === 401 || status === 403) denied.push(`${method} ${path} → ${status}`);
            }
            assert.deepEqual(denied, []);
            // E uma escrita real completa.
            const created = await server.request("/categorias", "POST", { name: `Admin ${prefix}` }, admin);
            assert.equal(created.status, 201);
            const { id } = await created.json();
            assert.equal((await server.request(`/categorias/${id}`, "DELETE", undefined, admin)).status, 200);
        });
    } finally {
        if (ids.orders.length) await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
        if (ids.product) await prisma.product.deleteMany({ where: { id: ids.product } });
        if (ids.category) await prisma.category.deleteMany({ where: { id: ids.category } });
        await prisma.user.deleteMany({ where: { email: customerEmail } });
        await prisma.admin.deleteMany({ where: { email: { in: [adminEmail, demoEmail] } } });
        await server.close();
        await prisma.$disconnect();
    }
});
