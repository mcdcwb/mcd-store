import { Router } from "express";
import { requireAdmin } from "../middlewares/require-admin.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { confirm, advance, cancel, list, details, archive, reports, statusCounts, myOrders } from "../controllers/order.controller.js";
const router = Router();
router.get("/mine", requireAuth, (req, res, next) => {
  if (res.locals.account.role !== "USER") return res.status(403).json({ error: "Acesso exclusivo para clientes." });
  next();
}, myOrders);
router.use(requireAdmin);
router.get("/", list);
router.get("/reports", reports);
router.get("/status-counts", statusCounts);
router.post("/:id/archive", archive);
router.get("/:id", details);
router.post("/:id/confirm", confirm);
router.post("/:id/advance", advance);
router.post("/:id/cancel", cancel);
export default router;
