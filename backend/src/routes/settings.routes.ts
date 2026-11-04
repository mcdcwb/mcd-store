import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middlewares/require-admin.js";
import { settingsSchema, storeDetailsSchema } from "../schemas/settings.schema.js";

import { stockSettingsSelect, storeDetailsSelect, publicStoreDetails, storeDetailsData } from "../services/settings.service.js";
import { dayLabels, type WeekDay } from "../lib/business-hours.js";

export function createSettingsRoutes(database: Pick<typeof prisma, "storeSettings"> = prisma) {
  const router = Router();
  router.get("/public", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const row = await database.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: { ...storeDetailsSelect, ...stockSettingsSelect } });
    res.json({ ...publicStoreDetails(row), lowStockThreshold: row.lowStockThreshold, showLowStockBadge: row.showLowStockBadge, showLastUnitBadge: row.showLastUnitBadge });
  });
  router.all("/public", (_req, res) => { res.status(405).json({ error: "Método não permitido." }); });
  router.use(requireAdmin);
  router.get("/store", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(publicStoreDetails(await database.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: storeDetailsSelect })));
  });
  router.put("/store", async (req, res) => {
    const parsed = storeDetailsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(issue => issue.path[0] === "businessHours"
      ? `${dayLabels[issue.path[1] as WeekDay] ?? "Horário de funcionamento"}: ${issue.message}` : issue.message).join(" ") || "Verifique os dados da loja.", errors: parsed.error.issues });
    const row = await database.storeSettings.update({ where: { id: 1 },
      data: { ...storeDetailsData(parsed.data.address, parsed.data.whatsapp), ...(parsed.data.businessHours ? { businessHours: parsed.data.businessHours } : {}) }, select: storeDetailsSelect });
    res.json(publicStoreDetails(row));
  });
  router.get("/", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await database.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: stockSettingsSelect }));
  });
  router.put("/", async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Verifique o limite de estoque e as opções de badges.", errors: parsed.error.issues });
    return res.json(await database.storeSettings.update({ where: { id: 1 }, data: parsed.data, select: stockSettingsSelect }));
  });
  return router;
}
