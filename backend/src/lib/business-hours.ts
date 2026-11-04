export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type WeekDay = typeof WEEK_DAYS[number];
export type DayHours = { isOpen: true; openingTime: string; closingTime: string } | { isOpen: false; openingTime: null; closingTime: null };
export type BusinessHours = Record<WeekDay, DayHours>;
export const dayLabels: Record<WeekDay, string> = {
  MONDAY: "Segunda-feira", TUESDAY: "Terça-feira", WEDNESDAY: "Quarta-feira", THURSDAY: "Quinta-feira",
  FRIDAY: "Sexta-feira", SATURDAY: "Sábado", SUNDAY: "Domingo"
};
export function isBusinessHours(value: unknown): value is BusinessHours {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 7) return false;
  return WEEK_DAYS.every(key => {
    const day = (value as Record<string, unknown>)[key];
    if (!day || typeof day !== "object" || Array.isArray(day)) return false;
    const row = day as Record<string, unknown>;
    if (Object.keys(row).length !== 3) return false;
    return row.isOpen === false ? row.openingTime === null && row.closingTime === null
      : row.isOpen === true && typeof row.openingTime === "string" && typeof row.closingTime === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(row.openingTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.closingTime) && row.openingTime < row.closingTime;
  });
}
// Used only for migration/test comparison: these are the former footer's hours.
export const initialBusinessHours: BusinessHours = Object.fromEntries(WEEK_DAYS.map((key, index) => [key,
  index === 6 ? { isOpen: false, openingTime: null, closingTime: null }
    : { isOpen: true, openingTime: index === 5 ? "10:00" : "09:00", closingTime: index === 5 ? "15:00" : "18:00" }
])) as BusinessHours;
