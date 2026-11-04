import type { Request, Response, NextFunction } from "express";
import { updateAccountSchema, changePasswordSchema } from "../schemas/account.schema.js";
import * as service from "../services/account.service.js";
import { EmailInUseError } from "../lib/account-registration.js";

export async function getProfile(_req: Request, res: Response) {
    const profile = await service.getProfile(res.locals.account.id);
    return profile ? res.json(profile) : res.status(404).json({ error: "Conta não encontrada." });
}
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
    const result = updateAccountSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Verifique o e-mail e preencha o endereço completo ou deixe-o vazio." });
    try { return res.json(await service.updateProfile(res.locals.account.id, result.data)); }
    catch (error) {
        if (error instanceof EmailInUseError) return res.status(409).json({ error: "E-mail já utilizado." });
        return next(error);
    }
}
export async function changePassword(req: Request, res: Response) {
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "A nova senha deve ter de 5 a 128 caracteres e a confirmação deve ser igual." });
    if (!await service.changePassword(res.locals.account.id, result.data)) return res.status(400).json({ error: "Senha atual incorreta." });
    return res.json({ message: "Senha alterada com sucesso." });
}

export async function getAdminProfile(_req: Request, res: Response) {
    if (res.locals.account.role !== "ADMIN") return res.status(403).json({ error: "Acesso exclusivo para administradores." });
    const profile = await service.getAdminProfile(res.locals.account.id);
    return profile ? res.json(profile) : res.status(404).json({ error: "Conta não encontrada." });
}
export async function updateAdminEmail(req: Request, res: Response, next: NextFunction) {
    if (res.locals.account.role !== "ADMIN") return res.status(403).json({ error: "Acesso exclusivo para administradores." });
    const result = updateAccountSchema.pick({ email: true }).strict().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Informe um e-mail válido." });
    try { return res.json(await service.updateAdminEmail(res.locals.account.id, result.data.email)); }
    catch (error) {
        if (error instanceof EmailInUseError) return res.status(409).json({ error: "E-mail já utilizado." });
        return next(error);
    }
}
export async function changeAdminPassword(req: Request, res: Response) {
    if (res.locals.account.role !== "ADMIN") return res.status(403).json({ error: "Acesso exclusivo para administradores." });
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "A nova senha deve ter de 5 a 128 caracteres e a confirmação deve ser igual." });
    if (!await service.changeAdminPassword(res.locals.account.id, result.data)) return res.status(400).json({ error: "Senha atual incorreta." });
    return res.json({ message: "Senha alterada com sucesso." });
}
