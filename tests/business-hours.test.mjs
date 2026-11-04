import test from "node:test";
import assert from "node:assert/strict";
import { businessHoursLines, hoursDraft, hoursToInput, WEEK_DAYS, isBusinessHours } from "../src/app/lib/business-hours.ts";
import { initialBusinessHours } from "../backend/src/lib/business-hours.ts";
test("footer groups only consecutive identical days and includes closed days", () => {
  assert.deepEqual(businessHoursLines(initialBusinessHours), ["Segunda a sexta: 09:00 às 18:00", "Sábado: 10:00 às 15:00", "Domingo: Fechado"]);
  const schedule = { ...structuredClone(initialBusinessHours), WEDNESDAY: { isOpen: false, openingTime: null, closingTime: null } };
  assert.deepEqual(businessHoursLines(schedule), ["Segunda e terça: 09:00 às 18:00", "Quarta: Fechado", "Quinta e sexta: 09:00 às 18:00", "Sábado: 10:00 às 15:00", "Domingo: Fechado"]);
  schedule.TUESDAY.openingTime = "10:00";
  assert.equal(businessHoursLines(schedule)[0], "Segunda: 09:00 às 18:00");
  assert.equal(businessHoursLines(schedule)[1], "Terça: 10:00 às 18:00");
  const closed = Object.fromEntries(WEEK_DAYS.map(day => [day, { isOpen: false, openingTime: null, closingTime: null }]));
  assert.deepEqual(businessHoursLines(closed), ["Segunda a domingo: Fechado"]);
  const weekend = { ...initialBusinessHours, SATURDAY: closed.SATURDAY, SUNDAY: closed.SUNDAY };
  assert.equal(businessHoursLines(weekend)[1], "Sábado e domingo: Fechado");
});
test("draft preserves times on closed toggles but sends canonical nulls; open days validate", () => {
  const draft = hoursDraft(initialBusinessHours);
  draft.MONDAY.isOpen = false;
  const input = hoursToInput(draft);
  assert.deepEqual(input.MONDAY, { isOpen: false, openingTime: null, closingTime: null });
  const saved = hoursDraft(input, draft); assert.equal(saved.MONDAY.openingTime, "09:00");
  saved.MONDAY.isOpen = true; assert.equal(hoursToInput(saved).MONDAY.closingTime, "18:00");
  saved.MONDAY.closingTime = "08:00"; assert.throws(() => hoursToInput(saved), /Segunda-feira/);
  assert.equal(hoursDraft(null).MONDAY.openingTime, "");
  assert.equal(isBusinessHours({ ...initialBusinessHours, MONDAY: { isOpen: true, openingTime: "25:00", closingTime: "26:00" } }), false);
  assert.equal(isBusinessHours(initialBusinessHours), true);
});
