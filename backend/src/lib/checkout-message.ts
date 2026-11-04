export interface MessageAddress {
  cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string;
}
export interface MessageItem {
  name: string; color: string; size: string; quantity: number; subtotalCents: number;
}
export function moneyFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Valor monetário inválido.");
  return `${(BigInt(cents) / 100n).toLocaleString("pt-BR")},${String(cents % 100).padStart(2, "0")}`;
}
// Keep names on one line and prevent user/catalog text from injecting WhatsApp formatting.
const plain = (text: string) => text.replace(/[\r\n\t]+/g, " ").replace(/[*_~`]/g, "").trim();
export function addressLine(address: MessageAddress): string {
  const cep = address.cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return [ `${plain(address.street)}, ${plain(address.number)}`, address.complement ? plain(address.complement) : "",
    plain(address.neighborhood), `${plain(address.city)} - ${plain(address.state)}`, `CEP ${cep}` ].filter(Boolean).join(" · ");
}
export function checkoutMessage(name: string, items: MessageItem[], method: "DELIVERY" | "PICKUP", address: MessageAddress | null, totalCents: number, orderNumber?: string): string {
  if (method === "DELIVERY" && !address) throw new Error("Endereço de entrega necessário.");
  return [ `Olá, meu nome é ${plain(name)}.`, ...(orderNumber ? [`Pedido: *#${plain(orderNumber)}*`] : []), "Este é o meu pedido:",
    ...items.map(item => `- Qtd: ${item.quantity}x ${plain(item.name)}.\nCor: *${plain(item.color)}*\nTamanho: *${plain(item.size)}*\nPreço: R$${moneyFromCents(item.subtotalCents)}.`),
    `Precisa de entrega? *${method === "DELIVERY" ? "Sim" : "Não"}*.`,
    ...(method === "DELIVERY" && address ? [`Endereço: ${addressLine(address)}.`] : []),
    `Valor Total de produtos: *R$${moneyFromCents(totalCents)}*.` ].join("\n\n");
}
