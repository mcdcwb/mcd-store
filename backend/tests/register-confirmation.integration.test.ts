import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { startTestServer } from "./helpers/http.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
const MESSAGE = "A confirmação da senha não confere.";

// Arquivo próprio: o cadastro tem rate limit por IP (10 tentativas/15 min) e cada arquivo de teste roda
// em um processo separado, com o limitador zerado.
test("POST /auth/register exige confirmPassword igual à senha e não a grava", async () => {
    const email = "confirmacao-" + randomUUID() + "@example.test";
    const password = "Confirma1-" + randomUUID().slice(0, 8);
    const http = await startTestServer(createApp());
    try {
        // Ausente, diferente, vazia ou de outro tipo: 400 com a mensagem própria, nada é criado.
        for (const confirmation of [{}, { confirmPassword: password + "x" }, { confirmPassword: "" }, { confirmPassword: null }, { confirmPassword: 123 }]) {
            const refused = await http.request("/auth/register", "POST", { name: "Cliente", email, password, ...confirmation });
            assert.equal(refused.status, 400, JSON.stringify(confirmation));
            assert.equal((await refused.json()).error, MESSAGE, JSON.stringify(confirmation));
        }
        assert.equal(await prisma.user.findUnique({ where: { email } }), null);
        // Regra de senha continua valendo antes da confirmação: senha fraca com confirmação igual → 400 genérico.
        const weak = await http.request("/auth/register", "POST", { name: "Cliente", email, password: "abcdef", confirmPassword: "abcdef" });
        assert.equal(weak.status, 400);
        assert.equal((await weak.json()).error, "Dados inválidos.");
        // Igual: 201; a resposta não ecoa a senha nem a confirmação, e o login funciona.
        const created = await http.request("/auth/register", "POST", { name: "Cliente", email, password, confirmPassword: password });
        assert.equal(created.status, 201);
        const body = await created.json();
        assert.deepEqual(Object.keys(body.account).sort(), ["email", "id", "name", "role"]);
        assert.equal(JSON.stringify(body).includes(password), false);
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        assert.equal("confirmPassword" in user, false, "a confirmação não é gravada");
        assert.equal((await http.request("/auth/login", "POST", { email, password })).status, 200);
    } finally {
        await prisma.user.deleteMany({ where: { email } });
        await http.close();
        await prisma.$disconnect();
    }
});
