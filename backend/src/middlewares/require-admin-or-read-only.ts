import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./require-auth.js";

// Modo demonstração do painel: o PRÓPRIO cliente (role USER) navega pelo /manager em modo leitura.
// Montado explicitamente (router.use) nos roteadores do painel, depois das rotas públicas/da loja
// que compartilham o prefixo. Assim cobre também rotas inexistentes sob esses prefixos.
export const PANEL_DEMO_MESSAGE = "Modo demonstração: alterações não são salvas.";
export const ADMIN_ONLY_MESSAGE = "Acesso exclusivo para administradores.";
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Interruptor: PANEL_READ_ONLY_FOR_USERS=true libera a leitura do painel para clientes.
// Ausente ou qualquer outro valor: só ADMIN (padrão seguro).
export const panelReadOnlyForUsers = () => process.env.PANEL_READ_ONLY_FOR_USERS === "true";

export async function requireAdminOrReadOnly(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
        const role = res.locals.account.role;
        if (role === "ADMIN") return next();
        if (role === "USER" && panelReadOnlyForUsers()) {
            if (READ_METHODS.has(req.method)) {
                // Leitura demonstrativa: os controllers mascaram dados pessoais de clientes reais.
                res.locals.readOnlyPanel = true;
                return next();
            }
            return res.status(403).json({ error: PANEL_DEMO_MESSAGE, message: PANEL_DEMO_MESSAGE, demo: true });
        }
        return res.status(403).json({ error: ADMIN_ONLY_MESSAGE });
    });
}

export const isReadOnlyPanel = (res: Response) => res.locals.readOnlyPanel === true;
