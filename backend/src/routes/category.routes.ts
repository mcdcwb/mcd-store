import { Router } from "express";
import { requireAdminOrReadOnly } from "../middlewares/require-admin-or-read-only.js";
import { listAvailableCategories, listCategories, saveCategory, deleteCategory } from "../controllers/category.controller.js";
const router = Router();
router.get("/disponiveis", listAvailableCategories);
// Painel: ADMIN completo; cliente (USER) só leitura quando PANEL_READ_ONLY_FOR_USERS=true.
router.use(requireAdminOrReadOnly);
router.get("/", listCategories);
router.post("/", saveCategory);
router.put("/:id", saveCategory);
router.delete("/:id", deleteCategory);
export default router;
