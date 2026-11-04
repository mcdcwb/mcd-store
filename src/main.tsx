import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { BrowserRouter, useLocation } from "react-router";
import { useLayoutEffect } from "react";
import { Toaster } from "./app/components/ui/sonner";
import "./styles/index.css";

function StoreTheme() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pathname === "/manager" || pathname.startsWith("/manager/")) delete root.dataset.storeTheme;
    else root.dataset.storeTheme = "dark";
    return () => { delete root.dataset.storeTheme; };
  }, [pathname]);
  return null;
}

function Notifications() {
  const { pathname } = useLocation();
  const manager = pathname === "/manager" || pathname.startsWith("/manager/");
  return <Toaster theme={manager ? "light" : "dark"} position="top-right" duration={manager ? 3500 : 2500} expand={!manager} visibleToasts={3} closeButton
    offset={{ top: 72, right: 24 }} mobileOffset={{ top: 72, left: 16, right: 16 }}
    containerAriaLabel="Notificações"
    toastOptions={{ closeButtonAriaLabel: "Fechar notificação", style: {
      fontFamily: "var(--font-sans)", padding: "12px 16px", boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
    } }} />;
}

createRoot(document.getElementById("root")!).render(<BrowserRouter>
  <StoreTheme />
  <App />
  <Notifications />
</BrowserRouter>);
