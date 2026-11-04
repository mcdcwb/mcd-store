import { z } from "zod";
const time = z.string({ error: "Informe um horário no formato HH:mm para dias abertos." }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido no formato HH:mm.");
const day = z.discriminatedUnion("isOpen", [
  z.object({ isOpen: z.literal(true), openingTime: time, closingTime: time }).strict()
    .refine(row => row.closingTime > row.openingTime, { message: "O fechamento deve ser posterior à abertura, no mesmo dia.", path: ["closingTime"] }),
  z.object({ isOpen: z.literal(false), openingTime: z.null().optional().default(null), closingTime: z.null().optional().default(null) }).strict()
]);
export const businessHoursSchema = z.object({
  MONDAY: day, TUESDAY: day, WEDNESDAY: day, THURSDAY: day, FRIDAY: day, SATURDAY: day, SUNDAY: day
}).strict();
