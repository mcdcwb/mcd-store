import type { Request, Response, NextFunction } from "express";
import { verifyAccountToken } from "../lib/token.js";
import { getAccount } from "../services/auth.service.js";
import type { TokenIdentity } from "../types/auth.js";
import { preservePublicErrorResponse } from "./error-handler.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    res.setHeader("Cache-Control", "no-store");
    const match = /^Bearer ([^\s]+)$/i.exec(req.get("authorization") ?? "");
    if (!match) {
        res.setHeader("WWW-Authenticate", "Bearer");
        return res.status(401).json({ error: "Autenticação necessária." });
    }
    let identity: TokenIdentity;
    try {
        identity = await verifyAccountToken(match[1]);
    } catch {
        res.setHeader("WWW-Authenticate", "Bearer");
        return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    try {
        const found = await getAccount(identity);
        if (!found) return res.status(401).json({ error: "Token inválido ou expirado." });
        if (!found.active) return res.status(403).json({ error: "Conta inativa." });
        res.locals.account = found.account;
        if (found.account.role === "ADMIN") {
            res.locals.admin = { id: found.account.id, email: found.account.email };
        }
    } catch (error) {
        preservePublicErrorResponse(res, "AUTH_ACCOUNT_LOOKUP");
        return next(error);
    }
    next();
}
