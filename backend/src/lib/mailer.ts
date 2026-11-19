import { logEvent } from "./logger.js";

// Envio de e-mail pela API HTTP do Brevo (POST /v3/smtp/email). Não usa SMTP: o Render gratuito
// bloqueia as portas 25, 465 e 587. Configuração só por variáveis de ambiente:
// BREVO_API_KEY, MAIL_FROM (e-mail do remetente, validado no Brevo) e MAIL_FROM_NAME (ex.: "MCD Store").
// Sem BREVO_API_KEY ou MAIL_FROM:
// - desenvolvimento/teste: não envia e mostra o link só no console;
// - produção: não envia e registra "mail.not_configured" (nunca o link nem o token).
// Os testes trocam o envio por uma captura em memória (setMailSender).
export const storeName = "MCD Store";
export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;
export interface Mail { to: string; toName?: string; subject: string; text: string; html: string }
type Sender = (mail: Mail) => Promise<void>;

let override: Sender | null = null;
export function setMailSender(sender: Sender | null) { override = sender; }

function brevoConfig() {
    const { BREVO_API_KEY: apiKey, MAIL_FROM: from, MAIL_FROM_NAME: fromName } = process.env;
    if (!apiKey?.trim() || !from?.trim()) return null;
    return { apiKey: apiKey.trim(), from: from.trim(), fromName: fromName?.trim() || storeName };
}

// Falha de envio com código seguro para o log (status HTTP do Brevo ou tempo esgotado), sem conteúdo.
export class MailDeliveryError extends Error {
    constructor(public code: string, public status?: number) { super("Falha no envio do e-mail."); this.name = "MailDeliveryError"; }
}

async function deliver(mail: Mail, devLink: string) {
    if (override) return override(mail);
    const config = brevoConfig();
    if (!config) {
        if (process.env.NODE_ENV === "production") { logEvent("error", "mail.not_configured"); return; }
        console.log(`[e-mail não enviado: Brevo não configurado] ${mail.subject} para ${mail.to}: ${devLink}`);
        return;
    }
    let response: Response;
    try {
        response = await fetch(BREVO_URL, {
            method: "POST",
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                sender: { email: config.from, name: config.fromName },
                to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
                subject: mail.subject, htmlContent: mail.html, textContent: mail.text
            })
        });
    } catch (error) {
        throw new MailDeliveryError(error instanceof Error && error.name === "TimeoutError" ? "ETIMEDOUT" : "ECONNECTION");
    }
    // O corpo da resposta não vai para o log (pode repetir dados do e-mail).
    if (!response.ok) throw new MailDeliveryError("EBREVO", response.status);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function passwordResetMail(to: string, name: string, link: string, minutes: number): Mail {
    const subject = `Redefinição de senha — ${storeName}`;
    const text = [
        `Olá, ${name}!`, "",
        `Recebemos um pedido para redefinir a senha da sua conta na ${storeName}.`,
        "Para criar uma nova senha, abra o link abaixo:", link, "",
        `O link vale por ${minutes} minutos e só pode ser usado uma vez.`,
        "Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.", "",
        storeName
    ].join("\n");
    const safeLink = escapeHtml(link);
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px">${storeName}</h1>
<p style="margin:0 0 12px">Olá, ${escapeHtml(name)}!</p>
<p style="margin:0 0 24px">Recebemos um pedido para redefinir a senha da sua conta na ${storeName}.</p>
<p style="margin:0 0 24px;text-align:center"><a href="${safeLink}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">Redefinir senha</a></p>
<p style="margin:0 0 12px;font-size:14px">O link vale por <strong>${minutes} minutos</strong> e só pode ser usado uma vez.</p>
<p style="margin:0 0 12px;font-size:14px;color:#57534e">Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>
<p style="margin:0;font-size:12px;color:#78716c;word-break:break-all">Se o botão não funcionar, copie e cole no navegador: ${safeLink}</p>
</div></body></html>`;
    return { to, toName: name, subject, text, html };
}

export function sendPasswordResetMail(to: string, name: string, link: string, minutes: number) {
    return deliver(passwordResetMail(to, name, link, minutes), link);
}
