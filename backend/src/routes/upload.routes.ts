import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { requireAdmin } from "../middlewares/require-admin.js";
import { uploadImage } from "../controllers/upload.controller.js";
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_TYPES, uploadProductImage, type ProductImageUploader } from "../services/upload.service.js";

export function createUploadRoutes(upload: ProductImageUploader = uploadProductImage) {
    const router = Router();
    const receive = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
        fileFilter: (_req, file, callback) => {
            if (!PRODUCT_IMAGE_TYPES.includes(file.mimetype)) return callback(new Error("Invalid image format"));
            callback(null, true);
        }
    }).single("file");
    router.post("/produtos", requireAdmin, rateLimit({
        windowMs: 15 * 60 * 1000, limit: 30, keyGenerator: (_req, res) => String(res.locals.account.id),
        standardHeaders: "draft-8", legacyHeaders: false,
        message: { error: "Muitos envios de imagem. Aguarde antes de tentar novamente." }
    }), (req, res, next) => {
        receive(req, res, error => {
            if (!error) return next();
            if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE")
                return res.status(413).json({ error: "A imagem deve ter no máximo 5 MiB." });
            return res.status(400).json({ error: "Envie somente um arquivo JPEG, PNG ou WebP válido no campo file." });
        });
    }, uploadImage(upload));
    return router;
}
