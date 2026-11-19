import { createUser } from "../services/user.service.js";
import type { Request, Response, NextFunction } from "express";
import {
    loginSchema, registerRequestSchema, REGISTER_CONFIRMATION_MESSAGE, forgotPasswordSchema, resetPasswordSchema,
    FORGOT_PASSWORD_MESSAGE, INVALID_RESET_LINK_MESSAGE, PASSWORD_RESET_MESSAGE
} from "../schemas/auth.schema.js";
import * as passwordReset from "../services/password-reset.service.js";
import { logEvent } from "../lib/logger.js";
import { SAME_PASSWORD_MESSAGE } from "./account.controller.js";
import * as authService from "../services/auth.service.js";
import { panelReadOnlyForUsers } from "../middlewares/require-admin-or-read-only.js";

export async function login(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store");
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: "Dados inválidos.", errors: result.error.issues });
    }
    const session = await authService.login(result.data);
    if (!session) return res.status(401).json({ error: "E-mail ou senha inválidos." });
    return res.json(session);
}

// panelAccess diz ao front se mostra o painel: "admin" (completo), "read-only" (cliente no modo
// demonstração, conforme PANEL_READ_ONLY_FOR_USERS) ou "none". Só orienta a interface: quem
// decide é o requireAdminOrReadOnly em cada requisição.
export function me(req: Request, res: Response) {
    const role = res.locals.account.role;
    return res.json({
        account: res.locals.account,
        panelAccess: role === "ADMIN" ? "admin" : panelReadOnlyForUsers() ? "read-only" : "none",
        ...(res.locals.admin ? { admin: res.locals.admin } : {})
    });
}

export async function register(req: Request, res: Response, next: NextFunction) {
    res.setHeader("Cache-Control", "no-store");
    const result = registerRequestSchema.safeParse(req.body);
    if (!result.success) {
        // Confirmação ausente ou diferente da senha: mensagem própria; demais erros seguem genéricos.
        const confirmation = result.error.issues.some(issue => issue.path[0] === "confirmPassword");
        return res.status(400).json({ error: confirmation ? REGISTER_CONFIRMATION_MESSAGE : "Dados inválidos.", errors: result.error.issues });
    }
    try {
        // Só nome, e-mail e senha seguem para o cadastro: a confirmação não é gravada.
        const { name, email, password } = result.data;
        const user = await createUser({ name, email, password });
        return res.status(201).json({ account: { ...user, role: "USER" } });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
            return res.status(409).json({ error: "E-mail já cadastrado." });
        }
        return next(error);
    }
}

// POST /auth/esqueci-senha: responde SEMPRE a mesma mensagem, exista ou não a conta. O token e o
// e-mail são gerados depois da resposta, para o tempo de resposta também não revelar a conta.
// Falhas só vão para o log como "mail.error" (sem destinatário, link nem token).
export function forgotPassword(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store");
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Informe um e-mail válido." });
    res.json({ message: FORGOT_PASSWORD_MESSAGE });
    void passwordReset.requestPasswordReset(result.data.email).catch(error => logEvent("error", "mail.error", error));
}

// POST /auth/redefinir-senha: valida o token (hash, validade, uso único) e troca a senha.
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
    res.setHeader("Cache-Control", "no-store");
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path[0];
        if (field === "token") return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: "INVALID_RESET_TOKEN" });
        return res.status(400).json({ error: field === "confirmPassword" ? REGISTER_CONFIRMATION_MESSAGE : "A nova senha deve ter de 6 a 128 caracteres, uma letra maiúscula e um número." });
    }
    try {
        const outcome = await passwordReset.resetPassword(result.data.token, result.data.password);
        if (outcome === "invalid") return res.status(400).json({ error: INVALID_RESET_LINK_MESSAGE, code: "INVALID_RESET_TOKEN" });
        if (outcome === "same-as-current") return res.status(400).json({ error: SAME_PASSWORD_MESSAGE, code: "SAME_PASSWORD" });
        return res.json({ message: PASSWORD_RESET_MESSAGE });
    } catch (error) {
        return next(error);
    }
}
