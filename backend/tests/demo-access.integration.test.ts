import "./helpers/assert-isolated-database.js";
import { categoryRelation } from "./helpers/category.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";
import { orderNumber } from "../src/lib/order-number.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const DEMO_MESSAGE = "Modo demonstração: alterações não são salvas.";
const ADMIN_ONLY = "Acesso exclusivo para administradores.";

// Modo demonstração = o PRÓPRIO cliente (USER) com leitura do painel, controlado por
// PANEL_READ_ONLY_FOR_USERS. Nenhuma troca de conta.
test("painel em modo leitura para o cliente: leitura liberada, escrita bloqueada, loja intacta e dados mascarados", async t => {
    const previousFlag = process.env.PANEL_READ_ONLY_FOR_USERS;
    process.env.PANEL_READ_ONLY_FOR_USERS = "true";
    const server = await startTestServer(createApp());
    const prefix = randomUUID();
    const adminEmail = `admin-${prefix}@example.test`, viewerEmail = `visitante-${prefix}@example.test`, customerEmail = `cliente-${prefix}@example.test`;
    const password = "DemoAccessA1-" + prefix;
    const ids: { product?: number; category?: number; orders: number[] } = { orders: [] };
    try {
        await createAdmin({ email: adminEmail, password });
        await createUser({ name: "Visitante Demo", email: viewerEmail, password });
        // Cliente REAL dono dos pedidos (outra pessoa, não o visitante).
        const customer = await createUser({ name: "Rodrigo Almeida Souza", email: customerEmail, password });
        const category = await prisma.category.create({ data: { name: `Demo ${prefix}`, normalizedName: `demo ${prefix}` } });
        ids.category = category.id;
        const product = await prisma.product.create({ data: { name: `Produto demo ${prefix}`, price: 50, public: "unissex", category: categoryRelation,
            colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "M", stock: 3 }] } } } }, include: { colors: { include: { variants: true } } } });
        ids.product = product.id;
        const variantId = product.colors[0]!.variants[0]!.id;
        const address = { cep: "80000000", street: "Rua Real", number: "123", complement: "ap 4", neighborhood: "Batel", city: "Curitiba", state: "PR" };
        const makeOrder = async (isDemo: boolean, name: string) => {
            const sequence = 900000 + Math.floor(Math.random() * 90000);
            const order = await prisma.order.create({ data: {
                number: orderNumber(sequence, new Date()), sequence, userId: customer.id, isDemo, status: "PENDING_CONFIRMATION", fulfillmentMethod: "DELIVERY",
                customerName: name, customerPhone: "+55 41 99876-1234", deliveryAddress: address, total: 50,
                idempotencyKey: randomUUID(), requestHash: "test", whatsappUrl: "", whatsappMessage: "",
                items: { create: { variantId, originalVariantId: variantId, productName: product.name, colorName: "Preto", size: "M", quantity: 1, unitPrice: 50, subtotal: 50 } },
            } });
            ids.orders.push(order.id);
            return order;
        };
        // Nomes com o prefixo do teste, para a busca não esbarrar em outros dados do banco isolado.
        const realName = `Rodrigo Real ${prefix.slice(0, 8)} Souza`, fictionalName = `Rodrigo Ficticio ${prefix.slice(0, 8)} Souza`;
        const realOrder = await makeOrder(false, realName), fictionalOrder = await makeOrder(true, fictionalName);

        const login = async (email: string, pass = password) => (await (await server.request("/auth/login", "POST", { email, password: pass })).json()).accessToken as string;
        const admin = await login(adminEmail);
        let viewer = await login(viewerEmail);

        const panelReads = ["/produtos/admin", "/categorias", "/orders", `/orders/${realOrder.id}`, "/orders/reports",
            "/orders/reports?start=2026-01-01&end=2026-01-31&groupBy=day", "/orders/status-counts", "/settings", "/settings/store"];
        // TODAS as rotas de escrita do painel + rotas inexistentes sob cada prefixo do painel.
        const panelWrites: [string, string, unknown?][] = [
            ["POST", "/produtos", {}], ["PUT", `/produtos/${product.id}`, {}], ["DELETE", `/produtos/${product.id}`],
            ["PATCH", `/produtos/${product.id}/carrossel`, { inCarousel: true }], ["PATCH", "/produtos/carrossel/ordem", { productIds: [product.id] }],
            ["POST", "/categorias", { name: "Nova" }], ["PUT", `/categorias/${category.id}`, { name: "Outra" }], ["DELETE", `/categorias/${category.id}`],
            ["POST", `/orders/${realOrder.id}/confirm`, {}], ["POST", `/orders/${realOrder.id}/advance`, { expectedStatus: "PREPARING" }],
            ["POST", `/orders/${realOrder.id}/cancel`, { expectedStatus: "PENDING_CONFIRMATION" }], ["POST", `/orders/${realOrder.id}/archive`, {}],
            ["PUT", "/settings", { lowStockThreshold: 3, showLowStockBadge: true, showLastUnitBadge: true }], ["PUT", "/settings/store", { whatsapp: "41999999999" }],
            ["POST", "/uploads/produtos", {}],
            // Inexistentes (rotas futuras) sob os prefixos do painel, em todos os métodos de escrita.
            ["POST", "/produtos/rota-futura", {}], ["PATCH", "/produtos/admin", {}], ["DELETE", "/produtos/admin/x"],
            ["POST", "/categorias/rota-futura/x", {}], ["PATCH", "/categorias", {}],
            ["PATCH", "/orders/rota-futura", {}], ["PUT", "/orders", {}], ["DELETE", `/orders/${realOrder.id}`], ["POST", "/orders/mine", {}],
            ["POST", "/settings/rota-futura", {}], ["DELETE", "/settings/store"], ["PATCH", "/settings", {}],
            ["PUT", "/uploads/produtos", {}], ["POST", "/uploads/rota-futura", {}], ["DELETE", "/uploads/produtos/x"],
        ];
        const snapshot = async () => JSON.stringify([
            await prisma.product.findUnique({ where: { id: product.id }, select: { name: true, inCarousel: true, isPublished: true } }),
            await prisma.category.findUnique({ where: { id: category.id }, select: { name: true } }),
            await prisma.order.findUnique({ where: { id: realOrder.id }, select: { status: true, archivedAt: true } }),
            await prisma.productVariant.findUnique({ where: { id: variantId }, select: { stock: true } }),
            await prisma.storeSettings.findUnique({ where: { id: 1 } }),
            await prisma.category.count(), await prisma.product.count(),
        ]);

        await t.test("/auth/me informa o acesso ao painel; a rota antiga /auth/demo-login não existe mais", async () => {
            assert.equal((await (await server.request("/auth/me", "GET", undefined, viewer)).json()).panelAccess, "read-only");
            assert.equal((await (await server.request("/auth/me", "GET", undefined, admin)).json()).panelAccess, "admin");
            assert.equal((await server.request("/auth/demo-login", "POST", undefined, viewer)).status, 404);
        });

        await t.test("(a) o cliente lê todas as telas do painel; visitante sem login recebe 401", async () => {
            for (const path of panelReads) {
                assert.equal((await server.request(path, "GET", undefined, viewer)).status, 200, `GET ${path}`);
                assert.equal((await server.request(path, "GET")).status, 401, `GET ${path} sem login`);
            }
        });

        await t.test("(a) toda escrita do cliente no painel recebe 403 demo, inclusive rotas inexistentes", async () => {
            const before = await snapshot();
            const escaped: string[] = [];
            for (const [method, path, body] of panelWrites) {
                const response = await server.request(path, method, body, viewer);
                const json = await response.json().catch(() => null);
                if (response.status !== 403 || json?.demo !== true || json?.message !== DEMO_MESSAGE) escaped.push(`${method} ${path} → ${response.status}`);
            }
            assert.deepEqual(escaped, [], "rotas de escrita do painel sem bloqueio para o cliente");
            assert.equal(await snapshot(), before, "nada pode mudar no banco");
        });

        await t.test("a conta administrativa (/conta/admin) segue exclusiva do ADMIN, com o 403 normal", async () => {
            for (const [method, path, body] of [["GET", "/conta/admin"], ["PATCH", "/conta/admin", { email: "x@example.test" }], ["PUT", "/conta/admin/senha", {}]] as const) {
                const response = await server.request(path, method, body, viewer);
                assert.equal(response.status, 403, `${method} ${path}`);
                const json = await response.json();
                assert.equal(json.demo, undefined); assert.equal(json.error, ADMIN_ONLY);
            }
        });

        await t.test("(b) o cliente continua escrevendo nas rotas da loja dele", async () => {
            assert.equal((await server.request(`/favoritos/${product.id}`, "PUT", undefined, viewer)).status, 200);
            assert.equal((await (await server.request("/favoritos", "GET", undefined, viewer)).json()).length, 1);
            assert.equal((await server.request(`/favoritos/${product.id}`, "DELETE", undefined, viewer)).status, 200);
            assert.equal((await server.request("/carrinho", "POST", { productId: product.id, size: "M", quantity: 1 }, viewer)).status, 200);
            assert.equal((await server.request("/carrinho", "PATCH", { productId: product.id, size: "M", quantity: 2 }, viewer)).status, 200);
            assert.equal((await (await server.request("/carrinho", "GET", undefined, viewer)).json()).items[0].quantity, 2);
            assert.equal((await server.request("/carrinho", "DELETE", undefined, viewer)).status, 200);
            assert.equal((await server.request("/conta", "PATCH", { email: viewerEmail, address: null, phone: "41 99999-0000" }, viewer)).status, 200);
            const newPassword = "NovaSenhaB2-" + prefix.slice(0, 6);
            assert.equal((await server.request("/conta/senha", "PUT", { currentPassword: password, newPassword, confirmPassword: newPassword }, viewer)).status, 200);
            viewer = await login(viewerEmail, newPassword);
            assert.ok(viewer, "login com a nova senha");
            assert.equal((await (await server.request("/orders/mine", "GET", undefined, viewer)).json()).items.length, 0);
        });

        await t.test("(c) o ADMIN continua com acesso total ao painel", async () => {
            for (const path of [...panelReads, "/conta/admin"]) assert.equal((await server.request(path, "GET", undefined, admin)).status, 200, `GET ${path}`);
            // Corpos inválidos/ids inexistentes: resposta de validação/404, nunca 401/403.
            const adminWrites: [string, string, unknown?][] = [
                ["POST", "/produtos", {}], ["PUT", "/produtos/2147483000", {}], ["DELETE", "/produtos/2147483000"],
                ["PATCH", "/produtos/2147483000/carrossel", { inCarousel: true }], ["PATCH", "/produtos/carrossel/ordem", { productIds: "x" }],
                ["POST", "/categorias", {}], ["PUT", "/categorias/2147483000", {}], ["DELETE", "/categorias/2147483000"],
                ["POST", "/orders/2147483000/confirm", {}], ["POST", "/orders/2147483000/advance", {}], ["POST", "/orders/2147483000/cancel", {}], ["POST", "/orders/2147483000/archive", {}],
                ["PUT", "/settings", {}], ["PUT", "/settings/store", { whatsapp: 123 }], ["POST", "/uploads/produtos", {}],
                ["PATCH", "/conta/admin", {}], ["PUT", "/conta/admin/senha", {}],
            ];
            const denied: string[] = [];
            for (const [method, path, body] of adminWrites) {
                const status = (await server.request(path, method, body, admin)).status;
                if (status === 401 || status === 403) denied.push(`${method} ${path} → ${status}`);
            }
            assert.deepEqual(denied, []);
            const created = await server.request("/categorias", "POST", { name: `Admin ${prefix}` }, admin);
            assert.equal(created.status, 201);
            assert.equal((await server.request(`/categorias/${(await created.json()).id}`, "DELETE", undefined, admin)).status, 200);
        });

        await t.test("(d) pedido de cliente real sai mascarado para o cliente; fictício completo; ADMIN vê tudo", async () => {
            const masked = await (await server.request(`/orders/${realOrder.id}`, "GET", undefined, viewer)).json();
            assert.equal(masked.privacyMasked, true);
            assert.equal(masked.customerName, "Rodrigo S.");
            assert.equal(masked.customerPhone, "(41) *****-1234");
            assert.deepEqual(masked.deliveryAddress, { cep: "", street: "", number: "", complement: "", neighborhood: "Batel", city: "Curitiba", state: "PR" });
            const fictional = await (await server.request(`/orders/${fictionalOrder.id}`, "GET", undefined, viewer)).json();
            assert.equal(fictional.privacyMasked, false);
            assert.equal(fictional.customerName, fictionalName);
            assert.equal(fictional.customerPhone, "+55 41 99876-1234");
            assert.equal(fictional.deliveryAddress.street, "Rua Real");
            const byNumber = await (await server.request(`/orders?search=${encodeURIComponent(realOrder.number)}`, "GET", undefined, viewer)).json();
            assert.deepEqual(byNumber.items.map((o: { id: number; customerName: string }) => [o.id, o.customerName]), [[realOrder.id, "Rodrigo S."]]);
            // Nenhum e-mail (de cliente ou de administrador) em lista ou detalhe.
            const list = await (await server.request("/orders?pageSize=50", "GET", undefined, viewer)).json();
            assert.ok(list.items.every((o: { isDemo: boolean; privacyMasked: boolean }) => o.privacyMasked === !o.isDemo));
            for (const body of [masked, fictional, list]) assert.doesNotMatch(JSON.stringify(body), /@/);
            const full = await (await server.request(`/orders/${realOrder.id}`, "GET", undefined, admin)).json();
            assert.equal(full.customerName, realName); assert.equal(full.deliveryAddress.street, "Rua Real"); assert.equal(full.privacyMasked, undefined);
        });

        await t.test("(d) busca por nome do cliente: só pedidos fictícios para o cliente; ADMIN encontra todos", async () => {
            const search = async (term: string, token: string) => (await (await server.request(`/orders?search=${encodeURIComponent(term)}&pageSize=50`, "GET", undefined, token)).json())
                .items.map((o: { id: number }) => o.id).sort();
            assert.deepEqual(await search(realName, viewer), []);
            assert.deepEqual(await search(fictionalName, viewer), [fictionalOrder.id]);
            assert.deepEqual(await search(prefix.slice(0, 8), viewer), [fictionalOrder.id]);
            assert.deepEqual(await search(prefix.slice(0, 8), admin), [realOrder.id, fictionalOrder.id].sort());
        });

        await t.test("interruptor desligado (PANEL_READ_ONLY_FOR_USERS=false): painel só para ADMIN", async () => {
            process.env.PANEL_READ_ONLY_FOR_USERS = "false";
            try {
                assert.equal((await (await server.request("/auth/me", "GET", undefined, viewer)).json()).panelAccess, "none");
                for (const path of panelReads) {
                    const response = await server.request(path, "GET", undefined, viewer);
                    assert.equal(response.status, 403, `GET ${path}`);
                    assert.deepEqual(await response.json(), { error: ADMIN_ONLY });
                    assert.equal((await server.request(path, "GET", undefined, admin)).status, 200, `ADMIN GET ${path}`);
                }
                for (const [method, path, body] of panelWrites) {
                    const response = await server.request(path, method, body, viewer);
                    assert.equal(response.status, 403, `${method} ${path}`);
                    assert.equal((await response.json()).demo, undefined, `${method} ${path} não é aviso de demonstração`);
                }
                // A loja do cliente segue funcionando.
                assert.equal((await server.request(`/favoritos/${product.id}`, "PUT", undefined, viewer)).status, 200);
                assert.equal((await server.request(`/favoritos/${product.id}`, "DELETE", undefined, viewer)).status, 200);
                // Ausente também é "desligado" (padrão seguro).
                delete process.env.PANEL_READ_ONLY_FOR_USERS;
                assert.equal((await server.request("/orders", "GET", undefined, viewer)).status, 403);
            } finally { process.env.PANEL_READ_ONLY_FOR_USERS = "true"; }
        });
    } finally {
        if (previousFlag === undefined) delete process.env.PANEL_READ_ONLY_FOR_USERS; else process.env.PANEL_READ_ONLY_FOR_USERS = previousFlag;
        if (ids.orders.length) await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
        if (ids.product) await prisma.product.deleteMany({ where: { id: ids.product } });
        if (ids.category) await prisma.category.deleteMany({ where: { id: ids.category } });
        await prisma.user.deleteMany({ where: { email: { in: [viewerEmail, customerEmail] } } });
        await prisma.admin.deleteMany({ where: { email: adminEmail } });
        await server.close();
        await prisma.$disconnect();
    }
});
