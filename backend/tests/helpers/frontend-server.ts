import { randomBytes } from "node:crypto";
import express from "express";
import { createApp } from "../../src/app.js";
import { setMailSender, type Mail } from "../../src/lib/mailer.js";

process.env.JWT_SECRET = randomBytes(32).toString("hex");
// Mesmo padrão do .env local: o cliente vê o painel em modo leitura (modo demonstração).
process.env.PANEL_READ_ONLY_FOR_USERS ??= "true";
// Links dos e-mails apontam para o Vite dos testes.
process.env.FRONTEND_ORIGIN = "http://127.0.0.1:4178";

// E2E: e-mails capturados em memória, nunca enviados. A rota de leitura existe só neste servidor de teste.
const outbox: Mail[] = [];
setMailSender(async mail => { outbox.push(mail); });
const server = express();
server.get("/__test/emails", (req, res) => {
    const to = typeof req.query.to === "string" ? req.query.to.toLowerCase() : null;
    res.set("Cache-Control", "no-store").json(outbox.filter(mail => !to || mail.to.toLowerCase() === to));
});
server.use(createApp());
server.listen(3187, "127.0.0.1");
