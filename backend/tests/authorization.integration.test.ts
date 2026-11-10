import "./helpers/assert-isolated-database.js";
import { categoryRelation } from "./helpers/category.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app.js";
import { getJwtKey } from "../src/config/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("public reading and administrative authorization", async (t) => {
    const email = "authorization-" + randomUUID() + "@example.test";
    const password = "Test-only-password-" + randomUUID();
    const http = await startTestServer(createApp());
    let productId: number | undefined;
    try {
        const admin = await createAdmin({ email, password });
        const product = await prisma.product.create({
            data: { name: "Authorization test", price: 12, public: "unissex", category: categoryRelation, colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "Unico", stock: 3 }] } } } }
        });
        productId = product.id;
        const login = await http.request("/auth/login", "POST", { email, password });
        assert.equal(login.status, 200);
        const { accessToken } = await login.json();
        const mutations = [
            { method: "POST", path: "/produtos", body: { name: "Unauthorized", price: 5, public: "unissex", category: categoryRelation, images: [], variants: [{ value: "Unico", stock: 1 }] } },
            { method: "PUT", path: "/produtos/" + product.id, body: { variants: [{ value: "Unico", stock: 99 }] } },
            { method: "DELETE", path: "/produtos/" + product.id, body: undefined }
        ];
        const assertDenied = async (token: string | undefined, status: number) => {
            for (const { method, path, body } of mutations) {
                assert.equal((await http.request(path, method, body, token)).status, status);
            }
        };

        await t.test("GET / and GET /produtos remain public", async () => {
            assert.equal((await http.request("/")).status, 200);
            assert.equal((await http.request("/produtos")).status, 200);
        });
        await t.test("missing credentials reject all mutations and /auth/me", async () => {
            await assertDenied(undefined, 401);
            assert.equal((await http.request("/auth/me")).status, 401);
        });
        await t.test("/auth/me returns only public identity", async () => {
            const response = await http.request("/auth/me", "GET", undefined, accessToken);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
                admin: { id: admin.id, email },
                account: { id: admin.id, name: email.split("@")[0], email, role: "ADMIN" },
                panelAccess: "admin"
            });
        });
        await t.test("invalid JWTs cannot mutate products", async () => {
            const issuedAt = Math.floor(Date.now() / 1000);
            const payload = { sub: String(admin.id), iss: "mcd-store", aud: "mcd-store-admin", iat: issuedAt, exp: issuedAt + 900 };
            const sign = (claims: Record<string, unknown>, key = getJwtKey(), alg = "HS256") =>
                new SignJWT(claims).setProtectedHeader({ alg, typ: "JWT" }).sign(key);
            const { exp, ...withoutExpiration } = payload;
            const tokens = [
                "not-a-jwt",
                await sign(payload, randomBytes(32)),
                await sign({ ...payload, iat: issuedAt - 1000, exp: issuedAt - 1 }),
                await sign({ ...payload, iss: "another-issuer" }),
                await sign({ ...payload, aud: "another-audience" }),
                await sign({ ...payload, sub: "not-an-id" }),
                await sign(withoutExpiration),
                await sign(payload, getJwtKey(), "HS384")
            ];
            for (const token of tokens) await assertDenied(token, 401);
        });
        await t.test("deactivating an admin immediately blocks an issued token", async () => {
            await prisma.admin.update({ where: { id: admin.id }, data: { active: false } });
            await assertDenied(accessToken, 403);
            assert.equal((await http.request("/auth/me", "GET", undefined, accessToken)).status, 403);
        });
        await t.test("deleting an admin invalidates its token", async () => {
            await prisma.admin.delete({ where: { id: admin.id } });
            await assertDenied(accessToken, 401);
        });
        const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { colors: { include: { variants: true } } } });
        assert.equal(unchanged.colors[0].variants[0].stock, 3);
    } finally {
        try {
            if (productId !== undefined) await prisma.product.deleteMany({ where: { id: productId } });
            await prisma.admin.deleteMany({ where: { email } });
        } finally {
            await http.close();
            await prisma.$disconnect();
        }
    }
});
