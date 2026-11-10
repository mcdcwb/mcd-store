import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { login, me, register } from "../controllers/auth.controller.js";
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
    router.get("/me", requireAuth, me);
    return router;
}
