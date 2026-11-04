import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "../services/shopping.service.js";

const id = z.number().int().positive().max(2147483647);
const selection = z.object({ productId: id, colorId: id.optional(), size: z.string().trim().min(1).max(100), quantity: id }).strict();
export function shopping(action: "favorites" | "favorite" | "unfavorite" | "read" | "review" | "add" | "set" | "remove" | "clear" | "merge") {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = res.locals.account.id as number;
            if (action === "review") return res.json(await service.cartForReview(userId));
            if (action === "favorites") return res.json(await service.favorites(res.locals.account));
            if (action === "favorite" || action === "unfavorite") {
                const productId = id.parse(Number(req.params.productId));
                return res.json(await service.favorite(res.locals.account, productId, action === "unfavorite"));
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
