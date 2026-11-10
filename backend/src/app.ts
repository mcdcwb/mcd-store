import orderRoutes from "./routes/order.routes.js";
import express from "express";
import helmet from "helmet";
import { getJwtKey } from "./config/auth.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { prisma } from "./lib/prisma.js";
import productRoutes from "./routes/product.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import shoppingRoutes from "./routes/shopping.routes.js";
import accountRoutes from "./routes/account.routes.js";
import { createCheckoutRoutes } from "./routes/checkout.routes.js";
import { createUploadRoutes } from "./routes/upload.routes.js";
import type { ProductImageUploader } from "./services/upload.service.js";
import { createSettingsRoutes } from "./routes/settings.routes.js";
import { logHttpError } from "./lib/logger.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { requestContext, requestLogFields } from "./middlewares/request-context.js";

export function createApp(options: { uploadProductImage?: ProductImageUploader; settingsDatabase?: Pick<typeof prisma, "storeSettings"> } = {}) {
    getJwtKey();
    const app = express();
    app.set("trust proxy", 1);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.use(requestContext);

    const allowedOrigins = new Set((process.env.FRONTEND_ORIGIN ?? "")
        .split(",").map(origin => origin.trim().replace(/\/$/, "")).filter(Boolean));
    if (process.env.NODE_ENV !== "production") {
        ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4178", "http://127.0.0.1:4178"]
            .forEach(origin => allowedOrigins.add(origin));
    }
    app.use((req, res, next) => {
        const origin = req.get("Origin");
        if (origin && allowedOrigins.has(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.vary("Origin");
            res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
            if (req.method === "OPTIONS") return res.sendStatus(204);
        }
        if (req.method === "OPTIONS") return res.sendStatus(403);
        next();
    });

    app.use(express.json({ limit: "1mb" }));
    app.use("/produtos", productRoutes);
    app.use("/categorias", categoryRoutes);
    app.use("/settings", createSettingsRoutes(options.settingsDatabase));
    app.use("/uploads", createUploadRoutes(options.uploadProductImage));
    app.use("/auth", createAuthRoutes());
    app.use("/conta", accountRoutes);
    app.use("/orders", orderRoutes);
    app.use("/checkout", createCheckoutRoutes(options.settingsDatabase));
    app.use(shoppingRoutes);

    app.get("/", async (req, res) => {
        try {
            await prisma.$queryRaw`SELECT 1`;

            res.send("API do MCD Store funcionando e conectada ao PostgreSQL!");
        } catch (error) {
            logHttpError("healthcheck.error", error, requestLogFields(req, res, 500));
            res.status(500).send("Erro ao conectar ao banco de dados.");
        }
    });

    app.use(errorHandler);

    return app;
}
