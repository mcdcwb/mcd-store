import { toast } from "sonner";
import { createElement } from "react";
import { StoreToast, type NotificationAction, type StoreToastType } from "../components/StoreToast";

function show(message: string, type: StoreToastType, tone?: string, action?: NotificationAction) {
  if (document.documentElement.dataset.storeTheme !== "dark") {
    return toast[type](message, { className: tone ? `toast-${tone}` : undefined });
  }
  const id = crypto.randomUUID();
  return toast[type](createElement(StoreToast, { id, message, type, action }), {
    id, className: `store-toast-shell ${tone ? `toast-${tone}` : ""}`, duration: Infinity,
    closeButton: false, icon: null, style: { padding: 0 },
  });
}

// All three represent confirmed operations; color describes the action, not failure.
export const notify = {
  positive: (message: string, action?: NotificationAction) => show(message, "success", "positive", action),
  change: (message: string) => show(message, "success", "change"),
  removal: (message: string) => show(message, "success", "removal"),
  error: (message: string) => show(message, "error"),
  warning: (message: string) => show(message, "warning"),
  info: (message: string) => show(message, "info"),
};

// Toasts do carrinho: ao abrir a gaveta eles perdem a função (a gaveta mostra o mesmo) e ficavam por cima
// dela, cobrindo os controles. Ao abrir, os que estão na tela são fechados; um "adicionado" que chegue com a
// gaveta já aberta (resposta do servidor depois do clique) não é exibido. Erros e outros assuntos seguem normais.
const cartToasts = new Set<string | number>();
let cartDrawerOpen = false;
const trackCart = (id: string | number) => { cartToasts.add(id); return id; };
export const cartNotify = {
  added: (message: string, action?: NotificationAction) => cartDrawerOpen ? undefined : trackCart(notify.positive(message, action)),
  positive: (message: string) => trackCart(notify.positive(message)),
  change: (message: string) => trackCart(notify.change(message)),
  removal: (message: string) => trackCart(notify.removal(message)),
};
export function setCartDrawerOpen(open: boolean) {
  cartDrawerOpen = open;
  if (!open) return;
  for (const id of cartToasts) toast.dismiss(id);
  cartToasts.clear();
}
