export function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const sizeButtonClass = "inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center p-0 text-center [overflow-wrap:anywhere]";
