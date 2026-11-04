import type { Request, Response, NextFunction } from "express";
import * as productService from "../services/product.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
    createProductSchema,
    carouselSchema,
    updateProductSchema
} from "../schemas/product.schema.js";

export async function setProductCarousel(req: Request, res: Response, next: NextFunction) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return res.status(400).json({ error: "ID inválido." });
    const result = carouselSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Informe se o produto pertence ao carrossel." });
    try {
        return res.json(await productService.setProductCarousel(id, result.data.inCarousel));
    } catch (error) {
        if (error instanceof productService.ProductError) return res.status(error.status).json({ error: error.message });
        return next(error);
    }
}

export async function getProducts(_req: Request, res: Response, next: NextFunction) {
    try {
        const products = await productService.getPublicProducts();

        res.set("Cache-Control", "no-store").json(products);
    } catch (error) {
        if (error instanceof productService.ProductError) return res.status(error.status).json({ error: error.message });
        return next(error);
    }
}

export async function getAdminProducts(_req: Request, res: Response) {
    res.set("Cache-Control", "no-store").json(await productService.getProducts());
}

export async function getCarouselProducts(_req: Request, res: Response) {
    res.set("Cache-Control", "no-store").json(await productService.getCarouselProducts());
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
    try {
        const result = createProductSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                error: "Dados inválidos.",
                errors: result.error.issues
            });
        }

        const product = await productService.createProduct(result.data);

        res.status(201).json(product);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return res.status(409).json({ error: "Categoria indisponível. Atualize a lista de categorias." });
        if (error instanceof productService.ProductError) return res.status(error.status).json({ error: error.message });
        return next(error);
    }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({
                error: "ID inválido."
            });
        }

        const existingProduct = await productService.getProductById(id);

        if (!existingProduct) {
            return res.status(404).json({
                error: "Produto não encontrado."
            });
        }

        const result = updateProductSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                error: "Dados inválidos.",
                errors: result.error.issues
            });
        }

        const product = await productService.updateProduct(id, result.data);

        res.json(product);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return res.status(409).json({ error: "Categoria indisponível. Atualize a lista de categorias." });
        if (error instanceof productService.ProductError) return res.status(error.status).json({ error: error.message });
        return next(error);
    }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({
                error: "ID inválido."
            });
        }

        const existingProduct = await productService.getProductById(id);

        if (!existingProduct) {
            return res.status(404).json({
                error: "Produto não encontrado."
            });
        }

        await productService.deleteProduct(id);

        res.json({
            message: "Produto excluído com sucesso."
        });
    } catch (error) {
        if (error instanceof productService.ProductError) return res.status(error.status).json({ error: error.message });
        return next(error);
    }
}
