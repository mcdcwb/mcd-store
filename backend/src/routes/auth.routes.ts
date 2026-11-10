import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { demoLogin, login, me, register } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

export function createAuthRoutes() {
    const router = Router();
    router.post("/login", rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { error: "Muitas tentativas de login. Tente novamente mais tarde." }
    }), login);
    router.post("/register", rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Muitas tentativas de cadastro. Tente novamente mais tarde." }
    }), register);
    // Painel demonstrativo: só um CLIENTE logado (token USER) pode abrir uma sessão DEMO, pelo
    // interruptor "Modo demonstração" do menu da conta. A conta do cliente não é alterada: o front
    // guarda o token USER à parte e o restaura ao sair. Várias pessoas podem usar ao mesmo tempo.
    router.post("/demo-login", rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Muitos acessos ao painel demonstrativo. Tente novamente em alguns minutos." }
    }), requireAuth, (_req, res, next) => {
        if (res.locals.account.role !== "USER") return res.status(403).json({ error: "O modo demonstração é ativado pela conta de cliente." });
        next();
    }, demoLogin);
    router.get("/me", requireAuth, me);
    return router;
}
