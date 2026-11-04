import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth.js";
import { shopping } from "../controllers/shopping.controller.js";

const router = Router();
router.use(["/favoritos", "/carrinho"], requireAuth);
router.use("/carrinho", (_req, res, next) => {
    if (res.locals.account.role !== "USER") return res.status(403).json({ error: "Acesso exclusivo para clientes." });
    next();
});
router.get("/favoritos", shopping("favorites"));
router.put("/favoritos/:productId", shopping("favorite"));
router.delete("/favoritos/:productId", shopping("unfavorite"));
router.get("/carrinho", shopping("read"));
router.get("/carrinho/conferencia", shopping("review"));
router.post("/carrinho", shopping("add"));
router.patch("/carrinho", shopping("set"));
router.delete("/carrinho/item", shopping("remove"));
router.delete("/carrinho", shopping("clear"));
router.post("/carrinho/sincronizar", shopping("merge"));
export default router;
