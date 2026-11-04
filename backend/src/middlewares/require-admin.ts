import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./require-auth.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
        if (res.locals.account.role !== "ADMIN") {
            return res.status(403).json({ error: "Acesso exclusivo para administradores." });
        }
        next();
    });
}
