import { z } from "zod";

export const settingsSchema = z.object({
  lowStockThreshold: z.number().int().min(1).max(9999).optional(),
  showLowStockBadge: z.boolean().optional(),
  showLastUnitBadge: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, "Informe as configurações a atualizar.");

import { addressSchema } from "./account.schema.js";
import { normalizeWhatsapp } from "../lib/store-contact.js";
import { businessHoursSchema } from "./business-hours.schema.js";

export const storeDetailsSchema = z.object({
  businessHours: businessHoursSchema.optional(),
  address: addressSchema.nullable().optional(),
  whatsapp: z.string().trim().max(40).transform((value, ctx) => {
    if (!value) return null;
    const normalized = normalizeWhatsapp(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Informe um telefone brasileiro válido com DDD." });
      return z.NEVER;
    }
    return normalized;
  }).nullable().optional()
}).strict().refine(row => row.address !== undefined || row.whatsapp !== undefined || row.businessHours !== undefined, "Informe os dados da loja a atualizar.");
