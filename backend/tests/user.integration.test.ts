import "./helpers/assert-isolated-database.js";
import { SignJWT } from "jose";
import { getJwtKey } from "../src/config/auth.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { verifyPassword } from "../src/lib/password.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");

test("public registration persists a user with a hash and rejects privileged fields", async () => {
    const email = "customer-" + randomUUID() + "@example.test";
    const password = "TestPasswordA1-" + randomUUID();
    const http = await startTestServer(createApp());
    try {
        for (const extra of [{ role: "ADMIN" }, { active: false }, { password: "tiny" }, { password: "abcdef" }, { password: "Abcdef" }, { password: "Abc1x" }, { name: "" }]) {
            assert.equal((await http.request("/auth/register", "POST", { name: "Cliente", email, password, ...extra })).status, 400);
        }
        const response = await http.request("/auth/register", "POST", { name: " Cliente ", email: email.toUpperCase(), password });
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.deepEqual(body.account, { id: body.account.id, name: "Cliente", email, role: "USER" });
        assert.equal("accessToken" in body, false);
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        assert.match(user.passwordHash, /^\$argon2id\$/);
        assert.equal(await verifyPassword(user.passwordHash, password), true);
        assert.equal(await prisma.admin.findUnique({ where: { email } }), null);
        assert.equal((await http.request("/auth/register", "POST", { name: "Cliente", email, password })).status, 409);
        await assert.rejects(createAdmin({ email, password }), { code: "P2002" });
    } finally {
        await prisma.user.deleteMany({ where: { email } });
        await http.close();
        await prisma.$disconnect();
    }
});

test("admin email cannot be registered as a customer", async () => {
    const email = "reserved-" + randomUUID() + "@example.test";
    const password = "TestPasswordA1-" + randomUUID();
    const http = await startTestServer(createApp());
    try {
        await createAdmin({ email, password });
        assert.equal((await http.request("/auth/register", "POST", { name: "Cliente", email: email.toUpperCase(), password })).status, 409);
        assert.equal(await prisma.user.findUnique({ where: { email } }), null);
    } finally {
        await prisma.admin.deleteMany({ where: { email } });
        await http.close();
        await prisma.$disconnect();
    }
});

test("concurrent admin and customer registration share an exclusive email", async () => {
    const email = "race-" + randomUUID() + "@example.test";
    const password = "TestPasswordA1-" + randomUUID();
    try {
        const results = await Promise.allSettled([
            createAdmin({ email, password }), createUser({ name: "Cliente", email, password }),
            createUser({ name: "Outro", email, password })
        ]);
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "P2002");
        assert.equal(await prisma.admin.count({ where: { email } }) + await prisma.user.count({ where: { email } }), 1);
    } finally {
        await prisma.admin.deleteMany({ where: { email } });
        await prisma.user.deleteMany({ where: { email } });
        await prisma.$disconnect();
    }
});

test("shared login and /me identify customers and admins without granting customer privileges", async (t) => {
    const email = "roles-" + randomUUID() + "@example.test";
    const adminEmail = "admin-" + email;
    const password = "TestPasswordA1-" + randomUUID();
    const http = await startTestServer(createApp());
    try {
        const user = await createUser({ name: "Cliente Real", email, password });
        const admin = await createAdmin({ email: adminEmail, password });
        let token: string;
        const response = await http.request("/auth/login", "POST", { email, password });
        assert.equal(response.status, 200);
        const session = await response.json();
        token = session.accessToken;
        assert.equal(session.expiresIn, 30 * 86400);
        assert.deepEqual(session.account, { ...user, role: "USER" });
        assert.equal("admin" in session, false);
        const me = await http.request("/auth/me", "GET", undefined, token);
        assert.equal(me.status, 200);
        // Sem PANEL_READ_ONLY_FOR_USERS=true, o cliente não tem acesso ao painel.
        assert.deepEqual(await me.json(), { account: { ...user, role: "USER" }, panelAccess: "none" });

        await t.test("expired USER and ADMIN tokens remain rejected by /auth/me", async () => {
            const now = Math.floor(Date.now() / 1000);
            for (const [role, id] of [["USER", user.id], ["ADMIN", admin.id]] as const) {
                const expired = await new SignJWT({ role }).setProtectedHeader({ alg: "HS256" })
                    .setSubject(String(id)).setIssuer("mcd-store").setAudience(`mcd-store-${role.toLowerCase()}`)
                    .setIssuedAt(now - 901).setExpirationTime(now - 1).sign(getJwtKey());
                assert.equal((await http.request("/auth/me", "GET", undefined, expired)).status, 401);
            }
        });
        await t.test("customer token cannot modify products", async () => {
            for (const [method, path] of [["POST", "/produtos"], ["PUT", "/produtos/1"], ["DELETE", "/produtos/1"]]) {
                assert.equal((await http.request(path!, method, {}, token)).status, 403);
            }
        });
        await t.test("same login identifies admins", async () => {
            const login = await http.request("/auth/login", "POST", { email: adminEmail, password });
            assert.equal(login.status, 200);
            const body = await login.json();
            assert.equal(body.account.role, "ADMIN");
            assert.deepEqual(body.admin, { id: admin.id, email: adminEmail });
        });
        await t.test("legacy admin JWT remains valid", async () => {
            const legacy = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
                .setSubject(String(admin.id)).setIssuer("mcd-store").setAudience("mcd-store-admin")
                .setIssuedAt().setExpirationTime("15m").sign(getJwtKey());
            const me = await http.request("/auth/me", "GET", undefined, legacy);
            assert.equal(me.status, 200);
            assert.equal((await me.json()).account.role, "ADMIN");
            assert.equal((await http.request("/produtos/invalid", "PUT", {}, legacy)).status, 400);
        });
        await t.test("audience and role must agree; a missing user role cannot become admin", async () => {
            for (const [role, audience] of [
                ["ADMIN", "mcd-store-user"], ["USER", "mcd-store-admin"],
                [undefined, "mcd-store-user"], ["ADMIN", ["mcd-store-admin", "mcd-store-user"]]
            ] as const) {
                const forged = await new SignJWT(role ? { role } : {}).setProtectedHeader({ alg: "HS256" })
                    .setSubject(String(user.id)).setIssuer("mcd-store").setAudience(typeof audience === "string" ? audience : [...audience])
                    .setIssuedAt().setExpirationTime("15m").sign(getJwtKey());
                assert.equal((await http.request("/auth/me", "GET", undefined, forged)).status, 401);
            }
        });
        await t.test("wrong customer password, inactive and deleted customers are rejected", async () => {
            assert.equal((await http.request("/auth/login", "POST", { email, password: password + "wrong" })).status, 401);
            await prisma.user.update({ where: { id: user.id }, data: { active: false } });
            assert.equal((await http.request("/auth/login", "POST", { email, password })).status, 401);
            assert.equal((await http.request("/auth/me", "GET", undefined, token)).status, 403);
            await prisma.user.delete({ where: { id: user.id } });
            assert.equal((await http.request("/auth/me", "GET", undefined, token)).status, 401);
        });
    } finally {
        await prisma.user.deleteMany({ where: { email } });
        await prisma.admin.deleteMany({ where: { email: adminEmail } });
        await http.close();
        await prisma.$disconnect();
    }
});

test("registration rate limit rejects excessive requests", async () => {
    const http = await startTestServer(createApp());
    try {
        for (let i = 0; i < 10; i++) assert.equal((await http.request("/auth/register", "POST", {})).status, 400);
        assert.equal((await http.request("/auth/register", "POST", {})).status, 429);
    } finally { await http.close(); }
});
