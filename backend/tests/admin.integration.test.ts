import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { verifyPassword } from "../src/lib/password.js";
import { createAdmin } from "../src/services/admin.service.js";

test("admin creation validates input, normalizes email and stores only an Argon2id hash", async () => {
    const email = "admin-" + randomUUID() + "@example.test";
    const password = "Test-only-password-" + randomUUID();
    try {
        await assert.rejects(createAdmin({ email, password: "tiny" }));
        const admin = await createAdmin({ email: " " + email.toUpperCase() + " ", password });
        assert.equal(admin.email, email);
        assert.equal(admin.active, true);
        assert.equal("passwordHash" in admin, false);
        const stored = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
        assert.match(stored.passwordHash, /^\$argon2id\$/);
        assert.notEqual(stored.passwordHash, password);
        assert.equal(await verifyPassword(stored.passwordHash, password), true);
        assert.equal(await verifyPassword(stored.passwordHash, "incorrect-password"), false);
        await assert.rejects(createAdmin({ email: email.toUpperCase(), password }), { code: "P2002" });
    } finally {
        await prisma.admin.deleteMany({ where: { email } });
        await prisma.$disconnect();
    }
});
