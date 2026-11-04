import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { verifyPassword } from "../src/lib/password.js";

test("admin CLI creates an account and rejects duplicate email and invalid input without leaking passwords", async () => {
    const email = "cli-" + randomUUID() + "@example.test";
    const password = "Test-only-password-" + randomUUID();
    const run = (ADMIN_EMAIL: string, ADMIN_PASSWORD: string) =>
        spawnSync(process.execPath, ["--import", "tsx", "src/scripts/create-admin.ts"], {
            env: { ...process.env, ADMIN_EMAIL, ADMIN_PASSWORD },
            encoding: "utf8",
            timeout: 15000,
            windowsHide: true
        });
    try {
        const invalid = run(email, "tiny");
        assert.equal(invalid.status, 1, invalid.stderr);
        assert.equal(await prisma.admin.findUnique({ where: { email } }), null);

        const created = run(email, password);
        assert.equal(created.status, 0, created.stderr);
        assert.equal(created.stdout.trim(), "Administrador criado com sucesso.");
        assert.equal((created.stdout + created.stderr).includes(email), false);
        assert.equal((created.stdout + created.stderr).includes(password), false);
        const admin = await prisma.admin.findUniqueOrThrow({ where: { email } });
        assert.equal(await verifyPassword(admin.passwordHash, password), true);

        const duplicate = run(email, password);
        assert.equal(duplicate.status, 1);
        assert.match(duplicate.stderr, /Já existe/);
        assert.equal((duplicate.stdout + duplicate.stderr).includes(password), false);
    } finally {
        await prisma.admin.deleteMany({ where: { email } });
        await prisma.$disconnect();
    }
});
