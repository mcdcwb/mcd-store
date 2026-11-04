import { Router } from "express";
import {
    getProducts,
    getAdminProducts,
    getCarouselProducts,
    setProductCarousel,
    createProduct,
    updateProduct,
    deleteProduct
} from "../controllers/product.controller.js";
import { requireAdmin } from "../middlewares/require-admin.js";

const router = Router();

router.get("/", getProducts);
router.get("/carrossel", getCarouselProducts);
router.get("/admin", requireAdmin, getAdminProducts);
router.post("/", requireAdmin, createProduct);
router.patch("/:id/carrossel", requireAdmin, setProductCarousel);
router.put("/:id", requireAdmin, updateProduct);
router.delete("/:id", requireAdmin, deleteProduct);

export default router;
