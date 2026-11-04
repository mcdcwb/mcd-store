import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Account } from "../lib/auth";
import { accountRequest } from "../lib/account";
import { Button } from "../components/ui/button";

const input = "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AdminAccountPage({ token, user, onUpdated }: { token: string; user: Account; onUpdated: (token: string, account: Account) => void }) {
  const [email, setEmail] = useState(user.email);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    const abort = new AbortController();
    void accountRequest<{ account: Account }>(token, "GET", undefined, "/conta/admin", abort.signal)
      .then(result => { if (!abort.signal.aborted) { setEmail(result.account.email); onUpdated(token, result.account); } })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar sua conta."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [token, onUpdated]);

  async function saveEmail(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true;
    setSaving(true); setError(""); setSuccess("");
    try {
      const result = await accountRequest<{ account: Account }>(token, "PATCH", { email }, "/conta/admin");
      setEmail(result.account.email); onUpdated(token, result.account); setSuccess("E-mail atualizado com sucesso.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o e-mail."); }
    finally { pending.current = false; setSaving(false); }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true;
    setPasswordError(""); setPasswordSuccess("");
    if (passwords.newPassword !== passwords.confirmPassword) { pending.current = false; setPasswordError("A confirmação da nova senha não confere."); return; }
    setSaving(true);
    try {
      await accountRequest(token, "PUT", passwords, "/conta/admin/senha");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPasswordSuccess("Senha alterada com sucesso.");
    } catch (reason) { setPasswordError(reason instanceof Error ? reason.message : "Não foi possível alterar sua senha."); }
    finally { pending.current = false; setSaving(false); }
  }

  return <div className="max-w-2xl space-y-8">
    <header><h1 className="font-serif text-3xl font-bold">Minha Conta</h1><p className="mt-2 text-muted-foreground">Atualize o acesso da sua conta administrativa.</p></header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p role="status">Carregando conta...</p> : <>
      <form onSubmit={saveEmail} className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-lg">E-mail</h2>
        <label className="block text-sm font-medium">E-mail<input className={input} type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => { setEmail(event.target.value); setSuccess(""); }} /></label>
        {success && <p role="status" className="text-sm text-primary">{success}</p>}
        <Button className="h-auto min-h-11 rounded-lg px-5 py-2.5" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar e-mail"}</Button>
      </form>
      <form onSubmit={savePassword} className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-lg">Senha</h2>
        {([ ["currentPassword", "Senha atual", "current-password", 1], ["newPassword", "Nova senha", "new-password", 5], ["confirmPassword", "Confirmar nova senha", "new-password", 5] ] as const).map(([key, label, autoComplete, minLength]) => <label key={key} className="block text-sm font-medium">{label}<input className={input} type="password" autoComplete={autoComplete} minLength={minLength} maxLength={128} required value={passwords[key]} onChange={event => setPasswords(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
        {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}{passwordSuccess && <p role="status" className="text-sm text-primary">{passwordSuccess}</p>}
        <Button className="h-auto min-h-11 rounded-lg px-5 py-2.5" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar nova senha"}</Button>
      </form>
    </>}
  </div>;
}
