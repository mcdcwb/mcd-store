
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middlewares/require-auth.js";
import { checkoutSchema } from "../schemas/checkout.schema.js";
import {
  CheckoutError,
  getCheckoutReview,
  prepareCheckoutWhatsapp,
} from "../services/checkout.service.js";
import { prisma } from "../lib/prisma.js";

export function createCheckoutRoutes(
  storeDatabase: Pick<typeof prisma, "storeSettings"> = prisma,
) {
  const router = Router();

  router.use(requireAuth, (_req, res, next) => {
    if (res.locals.account.role !== "USER") {
      return res
        .status(403)
        .json({ error: "Acesso exclusivo para clientes." });
    }

    next();
  });

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await getCheckoutReview(res.locals.account.id));
    } catch (error) {
      if (error instanceof CheckoutError) {
        return res.status(error.status).json({ error: error.message });
      }

      return next(error);
    }
  });

  router.post(
    "/whatsapp",
    (_req, res, next) => {
      if (process.env.DEMO_MODE === "true") {
        res.status(403).json({
          error: "O checkout está desativado nesta demonstração.",
        });
        return;
      }

      next();
    },
    (req, res, next) => {
      const parsed = checkoutSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error:
            "Verifique a escolha de recebimento e os dados conferidos.",
        });
      }

      res.locals.checkoutInput = parsed.data;
      next();
    },
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      keyGenerator: (_req, res) => String(res.locals.account.id),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skipFailedRequests: true,
      skip: async (_req, res) => {
        const input = res.locals.checkoutInput as
          | { idempotencyKey?: string }
          | undefined;

        if (!input?.idempotencyKey) return false;

        const existing = await prisma.order.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: res.locals.account.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true },
        });

        return existing !== null;
      },
      message: {
        error: "Muitas tentativas de finalização. Aguarde antes de tentar novamente.",
      },
    }),
    async (_req, res, next) => {
      try {
        res.json(
          await prepareCheckoutWhatsapp(
            res.locals.account.id,
            res.locals.checkoutInput,
            storeDatabase,
          ),
        );
      } catch (error) {
        if (error instanceof CheckoutError) {
          return res
            .status(error.status)
            .json({ error: error.message, review: error.review });
        }

        return next(error);
      }
    },
  );

  return router;
}
