import "./helpers/assert-isolated-database.js";
import { categoryRelation } from "./helpers/category.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser } from "../src/services/user.service.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("account shopping persists, isolates users and enforces stock in PostgreSQL", async t => {
    const server = await startTestServer(createApp());
    const prefix = randomUUID();
    const emails = ["a", "b", "admin"].map(v => `${v}-${prefix}@example.test`);
    const password = "TestPasswordA1-" + prefix;
    let productId: number | undefined;
    try {
        await createUser({ name: "User A", email: emails[0], password });
        await createUser({ name: "User B", email: emails[1], password });
        await createAdmin({ email: emails[2], password });
        const login = async (email: string) => {
            const res = await server.request("/auth/login", "POST", { email, password });
            assert.equal(res.status, 200);
            return (await res.json()).accessToken as string;
        };
        let a = await login(emails[0]);
        const b = await login(emails[1]), admin = await login(emails[2]);
        const product = await prisma.product.create({ data: { name: "Shopping fixture", price: 10, public: "unissex", category: categoryRelation, colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "P", stock: 3 }, { value: "M", stock: 2 }] } } } } });
        productId = product.id;
        const selection = { productId, size: "P", quantity: 1 };
        const req = (path: string, method = "GET", body?: unknown, token = a) => server.request(path, method, body, token);
        const read = async () => (await (await req("/carrinho")).json()).items;
        await t.test("favorites add, deduplicate, re-login, isolate and remove", async () => {
            const path = `/favoritos/${productId}`;
            assert.equal((await req(path, "PUT")).status, 200);
            assert.equal((await req(path, "PUT")).status, 200);
            assert.equal((await (await req("/favoritos")).json()).length, 1);
            a = await login(emails[0]);
            assert.equal((await (await req("/favoritos")).json())[0].product.id, productId);
            assert.deepEqual(await (await req("/favoritos?userId=1", "GET", undefined, b)).json(), []);
            await req(path, "DELETE", undefined, b);
            assert.equal((await (await req("/favoritos")).json()).length, 1);
            await req(path, "DELETE");
            assert.deepEqual(await (await req("/favoritos")).json(), []);
        });
        await t.test("favorites store product + color + size combinations without duplicates", async () => {
            const shirt = await prisma.product.create({ data: { name: "Favorite variants fixture", price: 10, public: "unissex", category: categoryRelation, colors: { create: [
                { colorName: "Amarelo", colorValue: "#ffcc00", images: ["amarelo.jpg"], position: 0, variants: { create: [{ value: "M", stock: 2 }, { value: "G", stock: 1 }] } },
                { colorName: "Preto", colorValue: "#111111", images: ["preto.jpg"], position: 1, variants: { create: [{ value: "G", stock: 1 }] } }] } }, include: { colors: { orderBy: { position: "asc" } } } });
            const [yellow, black] = shirt.colors;
            const otherColor = (await prisma.productColor.findFirstOrThrow({ where: { productId } })).id;
            const list = async () => (await (await req("/favoritos")).json()) as { productId: number; colorId: number | null; size: string | null; color: { colorName: string; images: string[] } | null }[];
            const combos = async () => (await list()).filter(f => f.productId === shirt.id).map(f => `${f.color?.colorName ?? "-"}/${f.size ?? "-"}`).sort();
            try {
                for (const body of [{ colorId: yellow.id, size: "M" }, { colorId: yellow.id }, { colorId: black.id, size: "G" }])
                    assert.equal((await req("/favoritos", "POST", { productId: shirt.id, ...body })).status, 200);
                assert.deepEqual(await combos(), ["Amarelo/-", "Amarelo/M", "Preto/G"]);
                const saved = (await list()).find(f => f.colorId === yellow.id && f.size === "M");
                assert.deepEqual(saved?.color?.images, ["amarelo.jpg"]);
                // Same exact combination (including "color without size") never repeats, even concurrently.
                const again = await Promise.all([{ colorId: yellow.id, size: "M" }, { colorId: yellow.id, size: "M" }, { colorId: yellow.id }, { colorId: yellow.id, size: null }]
                    .map(body => req("/favoritos", "POST", { productId: shirt.id, ...body })));
                assert.deepEqual(again.map(r => r.status), [200, 200, 200, 200]);
                assert.deepEqual(await combos(), ["Amarelo/-", "Amarelo/M", "Preto/G"]);
                const userA = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
                await assert.rejects(prisma.favorite.create({ data: { userId: userA.id, productId: shirt.id, colorId: yellow.id, size: null } }), (e: { code?: string }) => e.code === "P2002");
                // Color and size must belong to the product.
                assert.equal((await req("/favoritos", "POST", { productId: shirt.id, colorId: otherColor })).status, 404);
                assert.equal((await req("/favoritos", "POST", { productId: shirt.id, colorId: black.id, size: "M" })).status, 404);
                assert.equal((await req("/favoritos", "POST", { productId: shirt.id, size: "M" })).status, 400);
                // Removing only Amarelo M keeps the other combinations.
                assert.equal((await req("/favoritos", "DELETE", { productId: shirt.id, colorId: yellow.id, size: "M" })).status, 200);
                assert.deepEqual(await combos(), ["Amarelo/-", "Preto/G"]);
                // A removed size keeps the favorite (shown as unavailable); a removed color deletes its favorites.
                await req("/favoritos", "POST", { productId: shirt.id, colorId: yellow.id, size: "G" });
                await prisma.productVariant.deleteMany({ where: { colorId: yellow.id, value: "G" } });
                assert.deepEqual(await combos(), ["Amarelo/-", "Amarelo/G", "Preto/G"]);
                await prisma.productColor.delete({ where: { id: black.id } });
                assert.deepEqual(await combos(), ["Amarelo/-", "Amarelo/G"]);
            } finally { await prisma.product.delete({ where: { id: shirt.id } }); }
        });
        await t.test("cart adds variants, changes quantities and survives login", async () => {
            assert.equal((await req("/carrinho", "POST", selection)).status, 200);
            assert.equal((await req("/carrinho", "PATCH", { ...selection, quantity: 2 })).status, 200);
            assert.equal((await read())[0].quantity, 2);
            assert.equal((await req("/carrinho", "POST", { ...selection, size: "M" })).status, 200);
            a = await login(emails[0]);
            assert.equal((await read()).length, 2);
            assert.equal((await req("/carrinho", "POST", { ...selection, quantity: 2 })).status, 409);
            assert.equal((await req("/carrinho", "PATCH", { ...selection, quantity: 4 })).status, 409);
            assert.equal((await read())[0].quantity, 2);
        });
        await t.test("userId injection cannot read, update or delete another cart", async () => {
            const userA = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
            assert.deepEqual((await (await req(`/carrinho?userId=${userA.id}`, "GET", undefined, b)).json()).items, []);
            assert.equal((await req("/carrinho", "PATCH", { ...selection, userId: userA.id }, b)).status, 400);
            await req("/carrinho/item", "DELETE", { productId, size: "P" }, b);
            await req("/carrinho", "DELETE", undefined, b);
            assert.equal((await read()).length, 2);
            await req("/carrinho", "PATCH", selection, b);
            assert.equal((await read())[0].quantity, 2);
        });
        await t.test("guest merge is repeatable, reports stock changes and handles missing variants", async () => {
            const body = { items: [{ ...selection, quantity: 8 }, { ...selection, size: "removed" }] };
            const merged = await (await req("/carrinho/sincronizar", "POST", body)).json();
            assert.equal(merged.items[0].quantity, 3);
            assert.equal(merged.notices.length, 2);
            await req("/carrinho/sincronizar", "POST", body);
            assert.equal((await read())[0].quantity, 3);
        });
        await t.test("concurrent adds never exceed stock; stock reduction is reconciled", async () => {
            await req("/carrinho", "PATCH", selection);
            const results = await Promise.all(Array.from({ length: 4 }, () => req("/carrinho", "POST", selection)));
            assert.equal(results.filter(r => r.status === 200).length, 2);
            assert.equal(results.filter(r => r.status === 409).length, 2);
            await prisma.productVariant.updateMany({ where: { color: { productId: product.id }, value: "P" }, data: { stock: 1 } });
            assert.equal((await read())[0].quantity, 1);
        });
        await t.test("remove and clear only affect the current account", async () => {
            await req("/carrinho/item", "DELETE", { productId, size: "P" });
            assert.equal((await read()).length, 1);
            await req("/carrinho", "DELETE");
            assert.deepEqual(await read(), []);
            assert.equal((await (await req("/carrinho", "GET", undefined, b)).json()).items.length, 1);
        });
        await t.test("ADMIN favorites persist and remain isolated from USER and other administrators", async () => {
            const otherEmail = `other-${prefix}@example.test`;
            await createAdmin({ email: otherEmail, password });
            try {
                const otherToken = await login(otherEmail);
                const path = `/favoritos/${productId}`;
                await req(path, "PUT", undefined, a);
                assert.deepEqual(await (await req('/favoritos', 'GET', undefined, admin)).json(), []);
                assert.equal((await req(path, 'PUT', { userId: 1, adminId: 1 }, admin)).status, 200);
                await req(path, 'PUT', undefined, admin);
                const reread = await (await req('/favoritos', 'GET', undefined, await login(emails[2]))).json();
                assert.equal(reread.length, 1); assert.equal(reread[0].product.id, productId);
                assert.deepEqual(await (await req('/favoritos?adminId=1', 'GET', undefined, otherToken)).json(), []);
                await req(path, 'DELETE', undefined, otherToken);
                assert.equal((await (await req('/favoritos', 'GET', undefined, admin)).json()).length, 1);
                await req(path, 'DELETE', undefined, admin);
                assert.equal((await (await req('/favoritos', 'GET', undefined, a)).json()).length, 1);
                await req(path, 'DELETE', undefined, a);
            } finally { await prisma.admin.deleteMany({ where: { email: otherEmail } }); }
        });
        await t.test("anonymous/inactive accounts are rejected; ADMIN favorites remain separate from restricted carts", async () => {
            for (const [path, method, body] of [["/favoritos", "GET"], [`/favoritos/${productId}`, "PUT"], [`/favoritos/${productId}`, "DELETE"], ["/carrinho", "GET"], ["/carrinho", "POST", selection], ["/carrinho", "PATCH", selection], ["/carrinho", "DELETE"], ["/carrinho/item", "DELETE", { productId, size: "P" }], ["/carrinho/sincronizar", "POST", { items: [] }]] as const) {
                assert.equal((await server.request(path, method, body)).status, 401);
                assert.equal((await req(path, method, body, admin)).status, path.startsWith("/favoritos") ? 200 : 403);
            }
            await prisma.user.update({ where: { email: emails[0] }, data: { active: false } });
            assert.equal((await req("/favoritos")).status, 403);
            assert.equal((await req("/carrinho")).status, 403);
        });
    } finally {
        if (productId) await prisma.product.deleteMany({ where: { id: productId } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.admin.deleteMany({ where: { email: emails[2] } });
        await server.close();
        await prisma.$disconnect();
    }
});
