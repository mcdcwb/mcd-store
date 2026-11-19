import "./helpers/assert-isolated-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { BREVO_URL, MailDeliveryError, setMailSender, sendPasswordResetMail, type Mail } from "../src/lib/mailer.js";
import { hashResetToken } from "../src/services/password-reset.service.js";
import { createAdmin } from "../src/services/admin.service.js";
import { createUser } from "../src/services/user.service.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.FRONTEND_ORIGIN = "https://loja.example.test,https://outra.example.test";

const SENT = "Se o e-mail estiver cadastrado, você receberá um link em instantes.";
const INVALID = "Este link de redefinição é inválido ou expirou. Peça um novo link.";
const SAME = "A nova senha precisa ser diferente da senha atual.";
const outbox: Mail[] = [];
setMailSender(async mail => { outbox.push(mail); });
const tokenOf = (mail: Mail) => /\/redefinir-senha\?token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];
// O e-mail sai depois da resposta (o tempo de resposta não revela a conta): espera ele chegar.
async function mailFor(email: string, count: number) {
    for (let i = 0; i < 100; i++) {
        const mails = outbox.filter(mail => mail.to === email);
        if (mails.length >= count) return mails[count - 1]!;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("E-mail não chegou: " + email);
}

test("recuperação de senha: resposta única, token com hash, validade, uso único e sessões encerradas", async t => {
    const server = await startTestServer(createApp());
    const prefix = randomUUID().slice(0, 8);
    const original = "Original1-" + prefix, next = "Nova2-" + prefix;
    const email = `reset-${prefix}@example.test`, adminEmail = `reset-admin-${prefix}@example.test`, missing = `ninguem-${prefix}@example.test`;
    const forgot = (address: string, ip = "203.0.113.1") => fetch(server.baseUrl + "/auth/esqueci-senha", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify({ email: address })
    });
    // Cada etapa usa um IP (X-Forwarded-For; trust proxy = 1) para não esbarrar no limite de 10 por IP.
    let resetIp = "203.0.113.100";
    const reset = (token: string, password: string, confirmPassword = password) => fetch(server.baseUrl + "/auth/redefinir-senha", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": resetIp }, body: JSON.stringify({ token, password, confirmPassword })
    });
    const login = (password: string) => server.request("/auth/login", "POST", { email, password });
    try {
        const user = await createUser({ name: "Cliente Reset", email, password: original });
        await createAdmin({ email: adminEmail, password: original });
        const oldSession = (await (await login(original)).json()).accessToken as string;

        await t.test("mesma resposta exista ou não a conta; só o cliente recebe o e-mail", async () => {
            const responses = await Promise.all([forgot(missing, "203.0.113.2"), forgot(adminEmail, "203.0.113.3"), forgot(email.toUpperCase(), "203.0.113.4")]);
            for (const response of responses) {
                assert.equal(response.status, 200);
                assert.deepEqual(await response.json(), { message: SENT });
            }
            const mail = await mailFor(email, 1);
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.deepEqual(outbox.map(item => item.to), [email]);
            assert.match(mail.subject, /MCD Store/);
            assert.match(mail.text, /30 minutos/);
            assert.match(mail.html, /Redefinir senha/);
            assert.ok(mail.text.includes("https://loja.example.test/redefinir-senha?token="));
            // No banco fica só o hash SHA-256, com validade de 30 minutos.
            const token = tokenOf(mail)!;
            const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
            assert.equal(rows.length, 1);
            assert.equal(rows[0]!.tokenHash, hashResetToken(token));
            assert.notEqual(rows[0]!.tokenHash, token);
            assert.ok(Math.abs(rows[0]!.expiresAt.getTime() - Date.now() - 30 * 60 * 1000) < 60 * 1000);
            assert.equal(rows[0]!.usedAt, null);
        });

        await t.test("pedido novo invalida o link anterior; senha igual à atual é recusada sem gastar o link", async () => {
            const first = tokenOf(await mailFor(email, 1))!;
            assert.equal((await forgot(email, "203.0.113.5")).status, 200);
            const second = tokenOf(await mailFor(email, 2))!;
            assert.notEqual(first, second);
            let response = await reset(first, next);
            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), { error: INVALID, code: "INVALID_RESET_TOKEN" });
            for (const bad of ["", "curto", "x".repeat(43), second + "a"]) {
                response = await reset(bad, next);
                assert.equal(response.status, 400);
                assert.equal((await response.json()).code, "INVALID_RESET_TOKEN");
            }
            response = await reset(second, original);
            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), { error: SAME, code: "SAME_PASSWORD" });
            assert.equal((await reset(second, "fraca")).status, 400);
            assert.equal((await reset(second, next, next + "x")).status, 400);
            assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashResetToken(second) } })).usedAt, null);
        });

        await t.test("redefine a senha, marca o link como usado e encerra as sessões antigas", async () => {
            resetIp = "203.0.113.101";
            const token = tokenOf(await mailFor(email, 2))!;
            assert.equal((await server.request("/auth/me", "GET", undefined, oldSession)).status, 200);
            // JWT tem precisão de segundos: garante que a sessão antiga foi emitida antes da troca.
            await new Promise(resolve => setTimeout(resolve, 1100));
            const response = await reset(token, next);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { message: "Senha redefinida com sucesso. Entre com a nova senha." });
            const me = await server.request("/auth/me", "GET", undefined, oldSession);
            assert.equal(me.status, 401);
            assert.deepEqual(await me.json(), { error: "Sua senha foi alterada. Entre novamente." });
            assert.equal((await login(original)).status, 401);
            const fresh = await login(next);
            assert.equal(fresh.status, 200);
            assert.equal((await server.request("/auth/me", "GET", undefined, (await fresh.json()).accessToken)).status, 200);
            const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashResetToken(token) } });
            assert.ok(row.usedAt);
            const reused = await reset(token, "Outra3-" + prefix);
            assert.equal(reused.status, 400);
            assert.equal((await reused.json()).error, INVALID);
        });

        await t.test("link expirado é recusado", async () => {
            resetIp = "203.0.113.102";
            assert.equal((await forgot(email, "203.0.113.6")).status, 200);
            const token = tokenOf(await mailFor(email, 3))!;
            await prisma.passwordResetToken.update({ where: { tokenHash: hashResetToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
            const response = await reset(token, "Outra3-" + prefix);
            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "INVALID_RESET_TOKEN");
            assert.equal((await login(next)).status, 200);
        });

        await t.test("limite por e-mail (3 a cada 15 minutos), mesmo trocando de IP, e por IP", async () => {
            const limited = `limite-${prefix}@example.test`;
            const statuses = [];
            for (let i = 0; i < 4; i++) statuses.push((await forgot(limited, `198.51.100.${i + 1}`)).status);
            assert.deepEqual(statuses, [200, 200, 200, 429]);
            const byIp = [];
            for (let i = 0; i < 11; i++) byIp.push((await forgot(`ip-${i}-${prefix}@example.test`, "192.0.2.50")).status);
            assert.deepEqual(byIp, [...Array(10).fill(200), 429]);
            resetIp = "192.0.2.60";
            const resets = [];
            for (let i = 0; i < 11; i++) resets.push((await reset("x".repeat(43), next)).status);
            assert.deepEqual(resets, [...Array(10).fill(400), 429]);
        });
    } finally {
        await prisma.user.deleteMany({ where: { email } }); await prisma.admin.deleteMany({ where: { email: adminEmail } });
        await server.close();
    }
});

test("troca de senha do cliente encerra as outras sessões e devolve um token novo", async () => {
    const server = await startTestServer(createApp());
    const prefix = randomUUID().slice(0, 8);
    const email = `troca-${prefix}@example.test`, original = "Original1-" + prefix, next = "Nova2-" + prefix;
    try {
        await createUser({ name: "Cliente Troca", email, password: original });
        const tokenFor = async () => (await (await server.request("/auth/login", "POST", { email, password: original })).json()).accessToken as string;
        const current = await tokenFor(), other = await tokenFor();
        await new Promise(resolve => setTimeout(resolve, 1100));
        const response = await server.request("/conta/senha", "PUT", { currentPassword: original, newPassword: next, confirmPassword: next }, current);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.message, "Senha alterada com sucesso.");
        assert.equal(typeof body.accessToken, "string");
        assert.ok(Number.isFinite(body.expiresAt));
        for (const old of [current, other]) assert.equal((await server.request("/auth/me", "GET", undefined, old)).status, 401);
        assert.equal((await server.request("/auth/me", "GET", undefined, body.accessToken)).status, 200);
    } finally {
        await prisma.user.deleteMany({ where: { email } });
        await server.close();
    }
});

test("sem Brevo em produção: não envia e não registra o link nem o token", async () => {
    setMailSender(null);
    const saved = { NODE_ENV: process.env.NODE_ENV, BREVO_API_KEY: process.env.BREVO_API_KEY, MAIL_FROM: process.env.MAIL_FROM };
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try {
        delete process.env.BREVO_API_KEY; delete process.env.MAIL_FROM;
        process.env.NODE_ENV = "production";
        await sendPasswordResetMail("alguem@example.test", "Alguém", "https://loja.example.test/redefinir-senha?token=segredo", 30);
        process.env.NODE_ENV = "test";
        await sendPasswordResetMail("alguem@example.test", "Alguém", "https://loja.example.test/redefinir-senha?token=segredo-dev", 30);
    } finally {
        console.log = log;
        for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
        setMailSender(async mail => { outbox.push(mail); });
    }
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /"event":"mail.not_configured"/);
    assert.ok(!lines[0]!.includes("segredo") && !lines[0]!.includes("alguem@"));
    // Fora de produção, o link aparece só no console.
    assert.ok(lines[1]!.includes("segredo-dev"));
});

test("Brevo: envia pela API HTTP com api-key; falha e tempo esgotado viram erro sem dados sensíveis", async t => {
    setMailSender(null);
    const saved = { BREVO_API_KEY: process.env.BREVO_API_KEY, MAIL_FROM: process.env.MAIL_FROM, MAIL_FROM_NAME: process.env.MAIL_FROM_NAME };
    process.env.BREVO_API_KEY = "chave-teste"; process.env.MAIL_FROM = "loja@example.test"; process.env.MAIL_FROM_NAME = "MCD Store";
    const calls: { url: string; init: RequestInit }[] = [];
    let reply: () => Promise<Response> = async () => new Response(JSON.stringify({ messageId: "x" }), { status: 201 });
    // Só a URL do Brevo é simulada; as chamadas ao servidor de teste seguem pelo fetch real.
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        if (String(url) !== BREVO_URL) return realFetch(url, init);
        calls.push({ url, init }); return reply();
    });
    try {
        const link = "https://loja.example.test/redefinir-senha?token=" + "a".repeat(43);
        await sendPasswordResetMail("cliente@example.test", "Cliente", link, 30);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.url, BREVO_URL);
        assert.equal(calls[0]!.init.method, "POST");
        assert.equal((calls[0]!.init.headers as Record<string, string>)["api-key"], "chave-teste");
        assert.ok(calls[0]!.init.signal instanceof AbortSignal);
        const body = JSON.parse(String(calls[0]!.init.body));
        assert.deepEqual(body.sender, { email: "loja@example.test", name: "MCD Store" });
        assert.deepEqual(body.to, [{ email: "cliente@example.test", name: "Cliente" }]);
        assert.match(body.subject, /MCD Store/);
        assert.ok(body.htmlContent.includes(link) && body.textContent.includes(link));

        reply = async () => new Response("{\"message\":\"Key not found\"}", { status: 401 });
        await assert.rejects(sendPasswordResetMail("cliente@example.test", "Cliente", link, 30), (error: MailDeliveryError) => error.code === "EBREVO" && error.status === 401);
        reply = async () => { throw new DOMException("timeout", "TimeoutError"); };
        await assert.rejects(sendPasswordResetMail("cliente@example.test", "Cliente", link, 30), (error: MailDeliveryError) => error.code === "ETIMEDOUT");

        // A falha no envio não muda a resposta do pedido de link.
        const server = await startTestServer(createApp());
        const email = `brevo-${randomUUID().slice(0, 8)}@example.test`;
        await createUser({ name: "Cliente Brevo", email, password: "Original1-brevo" });
        const lines: string[] = [];
        const log = console.log;
        console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
        reply = async () => new Response("erro", { status: 500 });
        try {
            const response = await fetch(server.baseUrl + "/auth/esqueci-senha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { message: SENT });
            for (let i = 0; i < 100 && !lines.some(line => line.includes("mail.error")); i++) await new Promise(resolve => setTimeout(resolve, 20));
        } finally {
            console.log = log;
            await prisma.user.deleteMany({ where: { email } });
            await server.close();
        }
        const failure = lines.find(line => line.includes("mail.error"))!;
        assert.match(failure, /"errorCode":"EBREVO"/);
        assert.match(failure, /"statusCode":500/);
        assert.ok(!failure.includes(email) && !failure.includes("token") && !failure.includes("chave-teste"));
    } finally {
        for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
        setMailSender(async mail => { outbox.push(mail); });
        await prisma.$disconnect();
    }
});
