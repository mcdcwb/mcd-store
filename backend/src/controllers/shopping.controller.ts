import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "../services/shopping.service.js";

const id = z.number().int().positive().max(2147483647);
const favoriteSelection = z.object({ productId: id, colorId: id.nullable().default(null), size: z.string().trim().min(1).max(100).nullable().default(null) }).strict();
const selection = z.object({ productId: id, colorId: id.optional(), size: z.string().trim().min(1).max(100), quantity: id }).strict();
export function shopping(action: "favorites" | "favorite" | "unfavorite" | "read" | "review" | "add" | "set" | "remove" | "clear" | "merge") {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = res.locals.account.id as number;
            if (action === "review") return res.json(await service.cartForReview(userId));
            if (action === "favorites") return res.json(await service.favorites(res.locals.account));
            if (action === "favorite" || action === "unfavorite") {
                // POST/DELETE /favoritos recebem a combinação no corpo; PUT/DELETE /favoritos/:productId
                // (rota antiga, mantida para compatibilidade) não têm cor nem tamanho.
                const selected = req.params.productId === undefined ? favoriteSelection.parse(req.body) : { productId: id.parse(Number(req.params.productId)) };
                return res.json(await service.favorite(res.locals.account, selected, action === "unfavorite"));
            }
            const items = action === "merge" ? z.object({ items: z.array(selection).max(200) }).strict().parse(req.body).items
                : action === "add" || action === "set" ? [selection.parse(req.body)]
                : action === "remove" ? [{ ...selection.omit({ quantity: true }).parse(req.body), quantity: 1 }] : [];
            return res.json(await service.cart(userId, action, items, req.query.conferencia !== "1"));
        } catch (error) {
            if (error instanceof z.ZodError) return res.status(400).json({ error: "Dados inválidos." });
            if (error instanceof service.ShoppingError) return res.status(error.status).json({ error: error.message });
            return next(error);
        }
    };
}
