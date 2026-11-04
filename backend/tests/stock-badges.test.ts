import test from "node:test";
import assert from "node:assert/strict";
import { stockBadge } from "../src/lib/stock-badges.js";

const settings = { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };
const product = (stocks: number[]) => ({ colors: stocks.map(stock => ({ variants: [{ stock }] })) });
test("stock badges prioritize individual variants across colors, ignore zero variants and prioritize the last unit", () => {
  for (const [stocks, expected] of [
    [[0, 0, 1], "last-unit"], [[1, 5], "last-unit"], [[0, 10, 3], "low-stock"],
    [[0, 10, 8], null], [[0, 0, 0], null], [[0, 10], null]
  ] as const) assert.equal(stockBadge(product([...stocks]), settings), expected);
});
test("independent switches, threshold updates and unavailable settings", () => {
  assert.equal(stockBadge(product([1]), { ...settings, showLastUnitBadge: false }), "low-stock");
  assert.equal(stockBadge(product([1]), { ...settings, showLowStockBadge: false }), "last-unit");
  assert.equal(stockBadge(product([2]), { ...settings, showLowStockBadge: false }), null);
  assert.equal(stockBadge(product([1]), { ...settings, showLowStockBadge: false, showLastUnitBadge: false }), null);
  assert.equal(stockBadge(product([4, 10]), { ...settings, lowStockThreshold: 3 }), null);
  assert.equal(stockBadge(product([3, 10]), { ...settings, lowStockThreshold: 3 }), "low-stock");
  assert.equal(stockBadge(product([1]), null), null);
});

test("complete and incomplete selections use only compatible server variants", () => {
 const p = { colors: [{ id: 1, variants: [{ value: 'A', stock: 1 }, { value: 'B', stock: 5 }, { value: 'C', stock: 10 }, { value: 'D', stock: 0 }] }, { id: 2, variants: [{ value: 'A', stock: 8 }, { value: 'B', stock: 3 }] }] };
 assert.equal(stockBadge(p, settings), 'last-unit');
 for (const [size, expected] of [['A','last-unit'],['B','low-stock'],['C',null],['D',null]] as const) assert.equal(stockBadge(p, settings, { colorId: 1, size }), expected);
 assert.equal(stockBadge(p, settings, { colorId: 2, size: 'A' }), null);
 assert.equal(stockBadge(p, settings, { colorId: 2 }), 'low-stock');
 assert.equal(stockBadge(p, settings, { size: 'A' }), 'last-unit');
 assert.equal(stockBadge(p, settings, { sizes: ['C'] }), null);
 assert.equal(stockBadge(p, { ...settings, showLastUnitBadge: false }, { colorId: 1, size: 'A' }), 'low-stock');
});
