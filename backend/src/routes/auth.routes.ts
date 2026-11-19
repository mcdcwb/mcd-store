import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { forgotPassword, login, me, register, resetPassword } from "../controllers/auth.controller.js";
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
    // Recuperação de senha: por IP e por e-mail (3 pedidos a cada 15 minutos para o mesmo e-mail).
    const limited = (limit: number, error: string, keyGenerator?: (req: Request) => string) => rateLimit({
        windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-8", legacyHeaders: false, message: { error }, ...(keyGenerator ? { keyGenerator } : {})
    });
    router.post("/esqueci-senha",
        limited(10, "Muitos pedidos de redefinição. Tente novamente mais tarde."),
        limited(3, "Muitos pedidos para este e-mail. Aguarde 15 minutos e tente novamente.",
            req => "email:" + (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "")),
        forgotPassword);
    router.post("/redefinir-senha", limited(10, "Muitas tentativas de redefinição. Tente novamente mais tarde."), resetPassword);
    router.get("/me", requireAuth, me);
    return router;
}
