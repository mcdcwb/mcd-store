import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { NewPasswordFields } from "./NewPasswordFields";
import { passwordConfirmationState } from "../lib/password-rules";
import { PasswordResetError, requestPasswordReset, resetPassword } from "../lib/password-reset";

const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const inputClass = "w-full px-3.5 py-2.5 rounded-xl bg-input-background text-foreground font-medium placeholder:text-muted-foreground/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all";
const buttonClass = "w-full py-3 rounded-xl font-semibold text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer text-primary border border-primary hover:bg-primary hover:text-primary-foreground";
const INVALID_LINK = "Este link de redefinição é inválido ou expirou. Peça um novo link.";

// /esqueci-senha (pedir o link) e /redefinir-senha?token=... (criar a nova senha).
export function PasswordRecoveryPage({ mode, onLogin, onPasswordReset }: {
  mode: "request" | "reset"; onLogin: () => void; onPasswordReset: () => void;
}) {
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [mode]);
  return <main className="max-w-md mx-auto px-4 sm:px-6 py-12 min-h-[60vh]">
    <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" size={20} className="mr-2" />Voltar para a loja</Link>
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 space-y-4">
      {mode === "request" ? <RequestForm onLogin={onLogin} /> : <ResetForm onLogin={onLogin} onPasswordReset={onPasswordReset} />}
    </section>
  </main>;
}

function useRequest() {
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  return async <T,>(run: (signal: AbortSignal) => Promise<T>) => {
    if (pending.current) return null;
    const controller = new AbortController();
    pending.current = controller;
    try { return { value: await run(controller.signal) }; }
    catch (error) { if (controller.signal.aborted) return null; return { error: error instanceof Error ? error : new Error(String(error)) }; }
    finally { if (pending.current === controller) pending.current = null; }
  };
}

function RequestForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRequest();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Informe um e-mail válido."); return; }
    setError(""); setMessage(""); setLoading(true);
    const result = await request(signal => requestPasswordReset(email.trim(), signal));
    if (!result) return;
    setLoading(false);
    if ("error" in result) setError(result.error!.message); else setMessage(result.value);
  }
  return <>
    <h1 className="font-serif text-2xl font-bold">Esqueci minha senha</h1>
    <p className="text-sm text-muted-foreground">Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha, válido por 30 minutos.</p>
    <form noValidate onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="recovery-email" className={labelClass}>E-mail</label>
        <input id="recovery-email" type="email" autoComplete="email" maxLength={254} value={email} required
          onChange={event => { setEmail(event.target.value); setError(""); }} placeholder="seu@email.com" className={inputClass} />
      </div>
      {error && <p role="alert" className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
      {message && <p role="status" className="text-sm text-success bg-primary/10 px-3 py-2 rounded-lg">{message}</p>}
      <button type="submit" disabled={loading} className={buttonClass}>{loading ? "Aguarde..." : "Enviar link"}</button>
    </form>
    <p className="text-center text-xs text-muted-foreground">Lembrou a senha?
      <button type="button" onClick={onLogin} className="ml-2 text-primary font-medium underline underline-offset-2 hover:opacity-80">Entrar</button>
    </p>
  </>;
}

function ResetForm({ onLogin, onPasswordReset }: { onLogin: () => void; onPasswordReset: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  // O token fica só na memória: some da barra de endereço (histórico e Referer) assim que a tela abre.
  const [token] = useState(() => new URLSearchParams(location.search).get("token") ?? "");
  useEffect(() => {
    if (new URLSearchParams(location.search).has("token")) navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(!token);
  const [done, setDone] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRequest();
  const ready = passwordConfirmationState(password, confirmPassword).ready;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setError(""); setLoading(true);
    const result = await request(signal => resetPassword(token, password, confirmPassword, signal));
    if (!result) return;
    setLoading(false);
    if ("error" in result) {
      const failure = result.error;
      if (failure instanceof PasswordResetError && failure.code === "INVALID_RESET_TOKEN") setInvalid(true);
      else setError(failure!.message);
      return;
    }
    setPassword(""); setConfirmPassword(""); setDone(result.value);
    onPasswordReset();
  }

  if (invalid) return <>
    <h1 className="font-serif text-2xl font-bold">Link inválido ou expirado</h1>
    <p role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{INVALID_LINK}</p>
    <p className="text-sm text-muted-foreground">Os links valem por 30 minutos e só podem ser usados uma vez. Um pedido novo também invalida os links anteriores.</p>
    <Link to="/esqueci-senha" className={`${buttonClass} block text-center`}>Pedir um novo link</Link>
  </>;
  if (done) return <>
    <h1 className="font-serif text-2xl font-bold">Senha redefinida</h1>
    <p role="status" className="text-sm text-success bg-primary/10 px-3 py-2 rounded-lg">{done}</p>
    <p className="text-sm text-muted-foreground">Por segurança, as sessões abertas com a senha antiga foram encerradas.</p>
    <button type="button" onClick={onLogin} className={buttonClass}>Entrar</button>
  </>;
  return <>
    <h1 className="font-serif text-2xl font-bold">Criar nova senha</h1>
    <p className="text-sm text-muted-foreground">Escolha uma nova senha para a sua conta.</p>
    <form noValidate onSubmit={submit} className="space-y-3">
      <NewPasswordFields variant="stacked" inputClass={inputClass} labelClass={labelClass}
        password={{ label: "Nova senha", value: password, onChange: value => { setPassword(value); setError(""); }, placeholder: "Crie uma senha" }}
        confirmation={{ label: "Confirmar nova senha", value: confirmPassword, onChange: value => { setConfirmPassword(value); setError(""); }, placeholder: "Repita a senha" }} />
      {error && <p role="alert" className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
      <button type="submit" disabled={loading || !ready} className={buttonClass}>{loading ? "Aguarde..." : "Redefinir senha"}</button>
    </form>
  </>;
}
