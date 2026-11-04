import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsapp, formatWhatsapp, whatsappUrl } from "../src/lib/store-contact.js";

test("Brazilian phone normalization, display and WhatsApp links share one rule", () => {
  for (const value of ["(41) 99999-9999", "41999999999", "+55 (41) 99999-9999", "5541999999999"])
    assert.equal(normalizeWhatsapp(value), "5541999999999");
  assert.equal(formatWhatsapp("5541999999999"), "(41) 99999-9999");
  assert.equal(whatsappUrl("5541999999999"), "https://wa.me/5541999999999");
  assert.equal(normalizeWhatsapp("(55) 99999-9999"), "5555999999999");
  assert.equal(normalizeWhatsapp("(41) 3333-4444"), "554133334444");
  for (const value of ["", "123", "abc41999999999", "+141999999999", "++5541999999999", "0041999999999"])
    assert.equal(normalizeWhatsapp(value), null);
  assert.equal(whatsappUrl(null), null);
});
