import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const SAME = "A nova senha precisa ser diferente da senha atual.";
const WRONG = "Senha atual incorreta.";
const SCHEMA = "A nova senha deve ter de 6 a 128 caracteres, uma letra maiúscula, um número e a confirmação deve ser igual.";

// Os dois fluxos de troca de senha seguem a MESMA regra (service.replacePassword):
// (a) schema, (b) senha atual correta, (c) nova senha diferente do hash guardado.
test("troca de senha recusa a nova igual à atual, nos fluxos do cliente e do admin", async t => {
    const server = await startTestServer(createApp());
    const prefix = randomUUID();
    const original = "Original1-" + prefix.slice(0, 8), other = "Outra2-" + prefix.slice(0, 8);
    const emails = { user: `cliente-${prefix}@example.test`, admin: `admin-${prefix}@example.test`, userLimit: `limite-${prefix}@example.test`, adminLimit: `admin-limite-${prefix}@example.test` };
    try {
        await createUser({ name: "Cliente Senha", email: emails.user, password: original });
        await createUser({ name: "Cliente Limite", email: emails.userLimit, password: original });
        await createAdmin({ email: emails.admin, password: original });
        await createAdmin({ email: emails.adminLimit, password: original });
        const login = async (email: string, password: string) => server.request("/auth/login", "POST", { email, password });
        const tokenFor = async (email: string, password = original) => (await (await login(email, password)).json()).accessToken as string;
        const flows = [
            { name: "cliente (PUT /conta/senha)", path: "/conta/senha", email: emails.user, limitEmail: emails.userLimit,
                hash: (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { passwordHash: true } }) },
            { name: "admin (PUT /conta/admin/senha)", path: "/conta/admin/senha", email: emails.admin, limitEmail: emails.adminLimit,
                hash: (email: string) => prisma.admin.findUniqueOrThrow({ where: { email }, select: { passwordHash: true } }) },
        ];
        for (const flow of flows) {
            const token = await tokenFor(flow.email);
            const change = (currentPassword: string, newPassword: string, confirmPassword = newPassword) =>
                server.request(flow.path, "PUT", { currentPassword, newPassword, confirmPassword }, token);
            const expect400 = async (response: Response, message: string) => {
                assert.equal(response.status, 400);
                assert.deepEqual(await response.json(), { error: message });
            };

            await t.test(`${flow.name}: nova igual à atual → 400 com o aviso e a senha não muda`, async () => {
                const before = (await flow.hash(flow.email)).passwordHash;
                await expect400(await change(original, original), SAME);
                assert.equal((await flow.hash(flow.email)).passwordHash, before, "hash inalterado");
                assert.equal((await login(flow.email, original)).status, 200);
            });

            await t.test(`${flow.name}: senha atual errada → só "senha atual incorreta", mesmo se a nova coincidir com a guardada`, async () => {
                // A nova senha é igual à guardada, mas a atual digitada está errada: nada sobre a nova é revelado.
                await expect400(await change(other, original), WRONG);
                await expect400(await change("Errada9-x", other), WRONG);
                assert.equal((await login(flow.email, original)).status, 200);
            });

            await t.test(`${flow.name}: schema vem primeiro (regras e confirmação)`, async () => {
                await expect400(await change(original, "semregra"), SCHEMA);
                await expect400(await change(original, other, other + "x"), SCHEMA);
            });

            await t.test(`${flow.name}: nova diferente e válida → 200 e login só com a nova`, async () => {
                const response = await change(original, other);
                assert.equal(response.status, 200);
                assert.equal((await login(flow.email, other)).status, 200);
                assert.equal((await login(flow.email, original)).status, 401);
                // Agora a "atual" é a nova: repetir a mesma também é recusado.
                await expect400(await change(other, other), SAME);
            });

            await t.test(`${flow.name}: o rate limit conta a tentativa recusada por senha igual`, async () => {
                const limitToken = await tokenFor(flow.limitEmail);
                const statuses: number[] = [];
                for (let i = 0; i < 11; i++) {
                    statuses.push((await server.request(flow.path, "PUT", { currentPassword: original, newPassword: original, confirmPassword: original }, limitToken)).status);
                }
                // Limite de 10 recusas em 15 minutos por conta: a 11ª é bloqueada.
                assert.deepEqual(statuses, [...Array(10).fill(400), 429]);
            });
        }
    } finally {
        await prisma.user.deleteMany({ where: { email: { in: [emails.user, emails.userLimit] } } });
        await prisma.admin.deleteMany({ where: { email: { in: [emails.admin, emails.adminLimit] } } });
        await server.close();
        await prisma.$disconnect();
    }
});
