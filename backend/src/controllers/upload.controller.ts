import type { Request, Response } from "express";
import { UploadUnavailableError } from "../config/cloudinary.js";
import { imageMime, isCloudinaryImageUrl, type ProductImageUploader } from "../services/upload.service.js";

export const uploadImage = (upload: ProductImageUploader) => async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "Selecione uma imagem para enviar." });
    if (imageMime(req.file.buffer) !== req.file.mimetype)
        return res.status(400).json({ error: "Formato inválido. Envie uma imagem JPEG, PNG ou WebP válida." });
    try {
        const url = await upload(req.file.buffer);
        if (!isCloudinaryImageUrl(url)) throw new Error("Invalid upload response");
        return res.status(201).json({ url });
    } catch (error) {
        // Never log or return provider errors: they can contain request credentials.
        if (error instanceof UploadUnavailableError) console.error("Cloudinary image upload unavailable: required environment configuration is incomplete");
        if (error instanceof UploadUnavailableError) return res.status(503).json({ error: "Upload de imagens indisponível. Tente novamente mais tarde." });
        return res.status(502).json({ error: "Não foi possível enviar a imagem. Tente novamente." });
    }
};
