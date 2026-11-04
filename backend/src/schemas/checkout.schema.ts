import { z } from "zod";
import { addressSchema } from "./account.schema.js";

export const checkoutSchema = z.object({
  idempotencyKey: z.uuid(),
  fulfillmentMethod: z.enum(["DELIVERY", "PICKUP"]),
  reviewKey: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedContext: z.object({
    customerName: z.string().min(1).max(100),
    address: addressSchema.nullable(), pickupAddress: addressSchema.nullable(),
    whatsapp: z.string().max(40).nullable()
  }).strict()
}).strict();
