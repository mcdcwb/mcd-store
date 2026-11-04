import { createApp } from "./app.js";
import { logServerStarted } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { ensureInitialCarouselSelection } from "./services/product.service.js";
import { logCarouselInitializationFailure, startCarouselInitialization } from "./lib/carousel-initialization.js";

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();

const recovery = startCarouselInitialization({
    initialize: ensureInitialCarouselSelection,
    onFailure: logCarouselInitializationFailure,
    onSuccess() {
        console.info("Carousel initialization completed.");
    }
});

const server = app.listen(PORT, "0.0.0.0", () => {
    logServerStarted(PORT);
});

let shuttingDown = false;

const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;

    recovery.stop();

    server.close((error) => {
        if (error) {
            console.error("HTTP server shutdown failed.");
            process.exitCode = 1;
        }

        void prisma.$disconnect().catch(() => {
            console.error("Prisma disconnect failed during shutdown.");
            process.exitCode = 1;
        });
    });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);