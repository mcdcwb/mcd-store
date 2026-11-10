import { Router } from "express";
import {
    getProducts,
    getAdminProducts,
    getCarouselProducts,
    setProductCarousel,
    setCarouselOrder,
    createProduct,
    updateProduct,
    deleteProduct
} from "../controllers/product.controller.js";
import { requireAdminOrReadOnly } from "../middlewares/require-admin-or-read-only.js";

const router = Router();

router.get("/", getProducts);
router.get("/carrossel", getCarouselProducts);
// Daqui para baixo é painel: ADMIN completo; cliente (USER) só leitura quando
// PANEL_READ_ONLY_FOR_USERS=true. As rotas públicas da vitrine ficam acima.
router.use(requireAdminOrReadOnly);
router.get("/admin", getAdminProducts);
router.patch("/carrossel/ordem", setCarouselOrder);
router.post("/", createProduct);
router.patch("/:id/carrossel", setProductCarousel);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

export default router;
