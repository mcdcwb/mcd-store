import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middlewares/require-auth.js";
import { getProfile, updateProfile, changePassword, getAdminProfile, updateAdminEmail, changeAdminPassword } from "../controllers/account.controller.js";

const router = Router();
router.get("/admin", requireAuth, getAdminProfile);
router.patch("/admin", requireAuth, updateAdminEmail);
router.put("/admin/senha", requireAuth, rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (_req, res) => String(res.locals.account.id), skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde e tente novamente." } }), changeAdminPassword);
router.use(requireAuth, (_req, res, next) => {
    if (res.locals.account.role !== "USER") return res.status(403).json({ error: "Acesso exclusivo para clientes." });
    next();
});
router.get("/", getProfile);
router.patch("/", updateProfile);
router.put("/senha", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (_req, res) => String(res.locals.account.id), skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde e tente novamente." } }), changePassword);
export default router;
