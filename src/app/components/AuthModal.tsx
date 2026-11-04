import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { validateLogin, validateRegistration } from "../lib/auth";

export function AuthModal({
  mode,
  onClose,
  onLogin,
  onRegister,
  onSwitchMode,
  sessionError,
}: {
  mode: "login" | "register";
  onClose: () => void;
  onLogin: (email: string, password: string, signal: AbortSignal) => Promise<void>;
  onRegister: (name: string, email: string, password: string, signal: AbortSignal) => Promise<void>;
  onSwitchMode: () => void;
  sessionError: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => pending.current?.abort(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    const validation = mode === "login"
      ? validateLogin(email, password)
      : validateRegistration({ name, email, password });
    if (validation) { setError(validation); return; }
    setError("");
    setSuccess("");
    setLoading(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      if (mode === "login") {
        await onLogin(email, password, controller.signal);
      } else {
        await onRegister(name, email, password, controller.signal);
        setPassword("");
        setSuccess("Conta criada com sucesso. Entre com seu e-mail e senha.");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Não foi possível entrar.");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 store-backdrop bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = modalRef.current?.getBoundingClientRect();
          if (!bounds) return;
          const overlay = event.currentTarget.getBoundingClientRect();
          // Adapt each edge independently, preserving a clickable outer strip.
          const safeGap = (gap: number) => Math.min(100, Math.max(0, gap) / 2);
          if (event.clientX < bounds.left - safeGap(bounds.left - overlay.left) ||
            event.clientX > bounds.right + safeGap(overlay.right - bounds.right) ||
            event.clientY < bounds.top - safeGap(bounds.top - overlay.top) ||
            event.clientY > bounds.bottom + safeGap(overlay.bottom - bounds.bottom)) onClose();
        }}
      >
        <div ref={modalRef} className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4">
            <button
              aria-label="Fechar login ou cadastro"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {mode === "login" ? "Entrar" : "Criar conta"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login"
                ? "Acesse sua conta para continuar."
                : "Cadastre-se para salvar seus favoritos e pedidos."}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
            {mode === "register" && (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome completo
                </label>
                <input
                  type="text"
                  aria-label="Nome completo"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maria Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl text-auth-input bg-input-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all"
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                E-mail
              </label>
              <input
                type="email"
                aria-label="E-mail"
                autoComplete={mode === "login" ? "username" : "email"}
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-auth-input bg-input-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Senha
              </label>
              <input
                type="password"
                aria-label="Senha"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "login" ? 1 : 5}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl text-auth-input bg-input-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all"
                required
              />
            </div>

            {(error || sessionError) && (
              <p role="alert" className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error || sessionError}</p>
            )}
            {success && (
              <p role="status" className="text-xs text-success bg-primary/10 px-3 py-2 rounded-lg">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm mt-1 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-1">
              {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
              <button
                type="button"
                onClick={() => { setError(""); setSuccess(""); onSwitchMode(); }}
                className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
              >
                {mode === "login" ? "Cadastre-se" : "Entrar"}
              </button>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
