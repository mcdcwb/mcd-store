import test from "node:test";
import assert from "node:assert/strict";
import { checkoutMessage, moneyFromCents } from "../src/lib/checkout-message.js";
import { whatsappUrl } from "../src/lib/store-contact.js";

test("requested WhatsApp format, subtotals, special characters and optional complement", () => {
  const items = [{ name: "Camiseta Essential", color: "Preto", size: "M", quantity: 2, subtotalCents: 15980 },
    { name: "Calça Cargo", color: "Bege", size: "42", quantity: 1, subtotalCents: 14990 }];
  const address = { street: "Praça São João", number: "123", complement: "", neighborhood: "Sé", city: "São Paulo", state: "SP", cep: "01001000" };
  const message = checkoutMessage("João da Silva", items, "DELIVERY", address, 30970);
  assert.equal(message, "Olá, meu nome é João da Silva.\n\nEste é o meu pedido:\n\n- Qtd: 2x Camiseta Essential.\nCor: *Preto*\nTamanho: *M*\nPreço: R$159,80.\n\n- Qtd: 1x Calça Cargo.\nCor: *Bege*\nTamanho: *42*\nPreço: R$149,90.\n\nPrecisa de entrega? *Sim*.\n\nEndereço: Praça São João, 123 · Sé · São Paulo - SP · CEP 01001-000.\n\nValor Total de produtos: *R$309,70*.");
  assert.equal(new URL(whatsappUrl("5541999999999", message)!).searchParams.get("text"), message);
  const pickup = checkoutMessage("João da Silva", items, "PICKUP", address, 30970);
  assert.equal(pickup, "Olá, meu nome é João da Silva.\n\nEste é o meu pedido:\n\n- Qtd: 2x Camiseta Essential.\nCor: *Preto*\nTamanho: *M*\nPreço: R$159,80.\n\n- Qtd: 1x Calça Cargo.\nCor: *Bege*\nTamanho: *42*\nPreço: R$149,90.\n\nPrecisa de entrega? *Não*.\n\nValor Total de produtos: *R$309,70*.");
  assert.ok(!pickup.includes("Endereço:"));
  assert.equal(new URL(whatsappUrl("5541999999999", pickup)!).searchParams.get("text"), pickup);
  assert.equal(moneyFromCents(30), "0,30"); assert.equal(moneyFromCents(100000), "1.000,00");
  assert.equal(moneyFromCents(Number.MAX_SAFE_INTEGER), "90.071.992.547.409,91");
  assert.throws(() => checkoutMessage("João", items, "DELIVERY", null, 30970));
});
