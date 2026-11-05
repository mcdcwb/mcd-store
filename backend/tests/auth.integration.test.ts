import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { jwtVerify } from "jose";
import { createApp } from "../src/app.js";
import { getJwtKey } from "../src/config/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
import { loginSchema, registerSchema } from "../src/schemas/auth.schema.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("JWT configuration rejects missing or malformed secrets", () => {
    for (const JWT_SECRET of [undefined, "", "short", "g".repeat(64)]) {
        assert.throws(() => getJwtKey({ JWT_SECRET }), /JWT_SECRET/);
    }
    assert.equal(getJwtKey({ JWT_SECRET: "ab".repeat(32) }).length, 32);
});

test("registration enforces the new password requirements while login accepts legacy passwords", () => {
    const registration = (password: string) => registerSchema.safeParse({ name: "Cliente", email: "cliente@example.test", password }).success;
    assert.equal(registration("Abcde1"), true);
    assert.equal(registration("Abc1"), false);
    assert.equal(registration("abcdef"), false);
    assert.equal(registration("Abcdef"), false);
    assert.equal(registration("Abc1x"), false);
    assert.equal(registration("A" + "a1".repeat(64)), false);
    assert.equal(loginSchema.safeParse({ email: "cliente@example.test", password: "abcde" }).success, true);
});

test("login issues a persistent expiring JWT and rejects invalid credentials and inactive admins", async (t) => {
    const email = "login-" + randomUUID() + "@example.test";
    const password = "abcde";
    const http = await startTestServer(createApp());
    try {
        const admin = await createAdmin({ email, password });
        await t.test("valid login", async () => {
            const response = await http.request("/auth/login", "POST", { email: email.toUpperCase(), password });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "no-store");
            const body = await response.json();
            assert.deepEqual(body.admin, { id: admin.id, email });
            assert.equal(body.expiresIn, 30 * 24 * 60 * 60);
            assert.equal(body.tokenType, "Bearer");
            assert.equal("passwordHash" in body.admin, false);
            const { payload, protectedHeader } = await jwtVerify(body.accessToken, getJwtKey(), {
                algorithms: ["HS256"], issuer: "mcd-store", audience: "mcd-store-admin"
            });
            assert.equal(protectedHeader.alg, "HS256");
            assert.equal(payload.sub, String(admin.id));
            assert.equal(payload.exp! - payload.iat!, 30 * 24 * 60 * 60);
            assert.equal("passwordHash" in payload, false);
            assert.equal(body.expiresAt, payload.exp! * 1000);
        });
        await t.test("input validation", async () => {
            for (const body of [{}, { email: "invalid", password }, { email, password: "" }]) {
                const response = await http.request("/auth/login", "POST", body);
                assert.equal(response.status, 400);
            }
        });
        await t.test("generic failure for wrong password, unknown email and inactive admin", async () => {
            for (const body of [{ email, password: "incorrect-password" }, { email: "missing-" + email, password }]) {
                const response = await http.request("/auth/login", "POST", body);
                assert.equal(response.status, 401);
                assert.deepEqual(await response.json(), { error: "E-mail ou senha inválidos." });
            }
            await prisma.admin.update({ where: { id: admin.id }, data: { active: false } });
            const response = await http.request("/auth/login", "POST", { email, password });
            assert.equal(response.status, 401);
            assert.deepEqual(await response.json(), { error: "E-mail ou senha inválidos." });
        });
    } finally {
        try { await prisma.admin.deleteMany({ where: { email } }); }
        finally { await http.close(); await prisma.$disconnect(); }
    }
});

test("login rejects excessive attempts with 429", async () => {
    const http = await startTestServer(createApp());
    try {
        for (let index = 0; index < 10; index++) {
            assert.equal((await http.request("/auth/login", "POST", {})).status, 400);
        }
        const response = await http.request("/auth/login", "POST", {});
        assert.equal(response.status, 429);
        assert.ok(response.headers.get("retry-after"));
    } finally {
        await http.close();
    }
});
