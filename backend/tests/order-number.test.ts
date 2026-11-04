import test from "node:test";
import assert from "node:assert/strict";
import { orderNumber } from "../src/lib/order-number.js";
test("global sequence, month/year boundaries, Brazil timezone and expanded sequence", () => {
  assert.equal(orderNumber(1, new Date("2026-10-01T03:00:00Z")), "26100001");
  assert.equal(orderNumber(2, new Date("2026-10-02T03:00:00Z")), "26100002");
  assert.equal(orderNumber(51, new Date("2026-11-01T02:30:00Z")), "26100051");
  assert.equal(orderNumber(52, new Date("2026-11-01T03:00:00Z")), "26110052");
  assert.equal(orderNumber(81, new Date("2026-12-01T03:00:00Z")), "26120081");
  assert.equal(orderNumber(82, new Date("2027-01-01T02:30:00Z")), "26120082");
  assert.equal(orderNumber(9999, new Date("2026-10-01T03:00:00Z")), "26109999");
  assert.equal(orderNumber(10000, new Date("2026-10-01T03:00:00Z")), "261010000");
  assert.equal(orderNumber(2147483647, new Date("2026-10-01T03:00:00Z")), "26102147483647");
  for (const value of [0, 2147483648, -1, 1.5]) assert.throws(() => orderNumber(value, new Date()), RangeError);
});
