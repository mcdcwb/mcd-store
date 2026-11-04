import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

export type StoreToastType = "success" | "error" | "warning" | "info";
export type NotificationAction = { label: string; onClick: () => void };
const icons = { success: CheckCircle2, error: CircleAlert, warning: TriangleAlert, info: Info };

export function StoreToast({ id, message, type, action, duration = 2500 }: {
  id: string; message: string; type: StoreToastType; action?: NotificationAction; duration?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(100);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const shell = root.current?.closest<HTMLElement>("[data-sonner-toast]");
    if (!shell) return;
    let remaining = duration, started = Date.now();
    let timeout: number | undefined, tick: number | undefined;
    const reasons = new Set<string>();
    const update = () => setProgress(Math.max(0, remaining / duration * 100));
    const stop = () => {
      if (timeout !== undefined) remaining = Math.max(0, remaining - (Date.now() - started));
      clearTimeout(timeout); clearInterval(tick); timeout = undefined; tick = undefined;
      update();
    };
    const start = () => {
      started = Date.now();
      timeout = window.setTimeout(() => { if (!reasons.size) toast.dismiss(id); }, remaining);
      tick = window.setInterval(() => setProgress(Math.max(0, (remaining - (Date.now() - started)) / duration * 100)), 50);
    };
    const pause = (reason: string) => {
      if (!reasons.size) stop();
      reasons.add(reason); setPaused(true);
    };
    const resume = (reason: string) => {
      if (!reasons.delete(reason)) return;
      if (!reasons.size) { setPaused(false); start(); }
    };
    const enter = (event: PointerEvent) => { if (event.pointerType !== "touch") pause("hover"); };
    const leave = (event: PointerEvent) => { if (event.pointerType !== "touch") resume("hover"); };
    const touchStart = () => pause("touch"), touchEnd = () => resume("touch");
    const focus = () => pause("focus");
    const blur = (event: FocusEvent) => { if (!shell.contains(event.relatedTarget as Node | null)) resume("focus"); };
    const visibility = () => document.hidden ? pause("hidden") : resume("hidden");
    shell.addEventListener("pointerenter", enter); shell.addEventListener("pointerleave", leave);
    shell.addEventListener("touchstart", touchStart, { passive: true }); shell.addEventListener("touchend", touchEnd); shell.addEventListener("touchcancel", touchEnd);
    shell.addEventListener("focusin", focus); shell.addEventListener("focusout", blur);
    document.addEventListener("visibilitychange", visibility);
    if (shell.matches(":hover")) reasons.add("hover");
    if (shell.contains(document.activeElement)) reasons.add("focus");
    if (document.hidden) reasons.add("hidden");
    setPaused(reasons.size > 0);
    if (!reasons.size) start();
    return () => {
      clearTimeout(timeout); clearInterval(tick);
      shell.removeEventListener("pointerenter", enter); shell.removeEventListener("pointerleave", leave);
      shell.removeEventListener("touchstart", touchStart); shell.removeEventListener("touchend", touchEnd); shell.removeEventListener("touchcancel", touchEnd);
      shell.removeEventListener("focusin", focus); shell.removeEventListener("focusout", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, duration]);
  const Icon = icons[type];
  return <div ref={root} data-store-toast={type} data-paused={paused} className="store-toast" tabIndex={0}
    role={type === "error" || type === "warning" ? "alert" : "status"}
    onClick={() => toast.dismiss(id)} onKeyDown={event => {
      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toast.dismiss(id); }
    }}>
    <Icon className="store-toast-icon" aria-hidden="true" />
    <div className="store-toast-content">
      <p data-toast-message>{message}</p>
      {action && <button type="button" className="store-toast-action" onClick={event => {
        event.stopPropagation(); action.onClick(); toast.dismiss(id);
      }}>{action.label}</button>}
    </div>
    <button type="button" className="store-toast-close" aria-label="Fechar notificação" onClick={event => {
      event.stopPropagation(); toast.dismiss(id);
    }}><X size={16} aria-hidden="true" /></button>
    <div className="store-toast-progress" role="progressbar" aria-label="Tempo restante da notificação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <span style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  </div>;
}
