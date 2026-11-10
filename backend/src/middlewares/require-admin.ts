import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./require-auth.js";
import { ADMIN_ONLY_MESSAGE } from "./require-admin-or-read-only.js";

// Só ADMIN. Usado na conta administrativa (/conta/admin); o painel usa requireAdminOrReadOnly.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
        if (res.locals.account.role !== "ADMIN") return res.status(403).json({ error: ADMIN_ONLY_MESSAGE });
        next();
    });
}
