import type { Request, Response, NextFunction } from "express";
import { verifyAccountToken } from "../lib/token.js";

export const DEMO_BLOCK_MESSAGE = "Modo demonstração: alterações não são salvas.";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Ponto único de bloqueio do painel demonstrativo, montado antes de TODAS as rotas: qualquer
// método que não seja de leitura, vindo de um token DEMO, recebe 403 — inclusive rotas futuras.
// (Nenhum GET da API grava dados; se algum passar a gravar, bloqueie-o aqui também.)
export async function blockDemoWrites(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    const match = /^Bearer ([^\s]+)$/i.exec(req.get("authorization") ?? "");
    if (!match) return next();
    try {
        if ((await verifyAccountToken(match[1])).role === "DEMO") {
            return res.status(403).json({ error: DEMO_BLOCK_MESSAGE, message: DEMO_BLOCK_MESSAGE, demo: true });
        }
    } catch { /* token inválido: a rota responde 401 normalmente */ }
    return next();
}
