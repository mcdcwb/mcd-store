import { WEEK_DAYS, dayLabels, isBusinessHours, type BusinessHours, type WeekDay } from "../../../backend/src/lib/business-hours.ts";
export { WEEK_DAYS, dayLabels, isBusinessHours };
export type { BusinessHours, WeekDay };
export type HoursDraft = Record<WeekDay, { isOpen: boolean; openingTime: string; closingTime: string }>;
export function hoursDraft(hours: BusinessHours | null, previous?: HoursDraft): HoursDraft {
  return Object.fromEntries(WEEK_DAYS.map(day => [day, {
    isOpen: hours?.[day].isOpen ?? false,
    openingTime: hours?.[day].openingTime ?? previous?.[day].openingTime ?? "",
    closingTime: hours?.[day].closingTime ?? previous?.[day].closingTime ?? ""
  }])) as HoursDraft;
}
export function hoursToInput(draft: HoursDraft): BusinessHours {
  const hours = Object.fromEntries(WEEK_DAYS.map(day => [day, draft[day].isOpen
    ? { isOpen: true, openingTime: draft[day].openingTime, closingTime: draft[day].closingTime }
    : { isOpen: false, openingTime: null, closingTime: null }])) as BusinessHours;
  for (const day of WEEK_DAYS) {
    const row = hours[day];
    if (row.isOpen && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.openingTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.closingTime) || row.closingTime <= row.openingTime))
      throw new Error(`${dayLabels[day]}: informe horários válidos, com fechamento posterior à abertura no mesmo dia.`);
  }
  return hours;
}
const shortLabel = (day: WeekDay) => dayLabels[day].replace("-feira", "");
export function businessHoursLines(hours: BusinessHours): string[] {
  const groups: { first: WeekDay; last: WeekDay; count: number }[] = [];
  for (const day of WEEK_DAYS) {
    const last = groups.at(-1);
    const current = hours[day], previous = last && hours[last.last];
    if (last && previous && previous.isOpen === current.isOpen && previous.openingTime === current.openingTime && previous.closingTime === current.closingTime) { last.last = day; last.count++; }
    else groups.push({ first: day, last: day, count: 1 });
  }
  return groups.map(group => {
    const label = group.count === 1 ? shortLabel(group.first) : `${shortLabel(group.first)} ${group.count === 2 ? "e" : "a"} ${shortLabel(group.last).toLocaleLowerCase("pt-BR")}`;
    const row = hours[group.first];
    return `${label}: ${row.isOpen ? `${row.openingTime} às ${row.closingTime}` : "Fechado"}`;
  });
}
