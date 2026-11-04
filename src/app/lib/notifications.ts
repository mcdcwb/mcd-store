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
