import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./require-auth.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
        // DEMO vê o painel como um admin; as escritas são barradas antes, em blockDemoWrites.
        if (res.locals.account.role !== "ADMIN" && res.locals.account.role !== "DEMO") {
            return res.status(403).json({ error: "Acesso exclusivo para administradores." });
        }
        next();
    });
}
