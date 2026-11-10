import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { Account } from "../lib/auth";
import { accountRequest, emptyAddress, formatCep, lookupCep, type Address, type Profile } from "../lib/account";

export function AccountPage({ user, favorites, onLogin, children, accessToken, onUpdated }: {
  children?: ReactNode; user: Account | null; favorites: boolean; onLogin: () => void;
  accessToken?: string; onUpdated: (token: string, account: Account) => void;
}) {
  const location = useLocation();
  const checkoutReturn = !favorites && new URLSearchParams(location.search).get("returnTo") === "/checkout";
  const showsAccount = !!user && (favorites || user.role === "USER");
  // Volta ao topo ao abrir Favoritos, Minha Conta ou a Área de clientes (como Checkout e Meus Pedidos).
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [location.pathname, showsAccount]);
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 min-h-[60vh]">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" size={16} className="mr-2" />Voltar para a loja</Link>
      {checkoutReturn && user?.role === "USER" && <Link to="/checkout" className="ml-4 inline-flex min-h-11 items-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-primary">Voltar ao checkout</Link>}
      <section className="mt-8 p-6 sm:p-8 bg-card border border-border rounded-xl">
        {showsAccount ? (
          <>
            <h1 className="font-serif text-3xl font-bold">{favorites ? "Favoritos" : "Minha Conta"}</h1>
            <p className="mt-4 text-muted-foreground">{favorites
              ? "Seus favoritos salvos na conta."
              : `Olá, ${user.name.trim().split(/\s+/)[0]}! Este é o espaço da sua conta.`}</p>
            {favorites && children}
            {!favorites && accessToken && <AccountForm key={accessToken} user={user} token={accessToken} onUpdated={onUpdated} checkoutReturn={checkoutReturn} />}
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-bold">Área de clientes</h1>
            <p className="mt-4 text-muted-foreground">Entre com uma conta de cliente para acessar esta página.</p>
            {!user && <button onClick={onLogin} className="mt-6 px-5 py-2 rounded-sm bg-muted text-primary border border-primary px-4 py-2 disabled:opacity-50 cursor-pointer hover:bg-primary hover:text-primary-foreground">Entrar</button>}
          </>
        )}
      </section>
    </main>
  );
}

const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-border bg-input-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";
const buttonClass = "rounded-sm bg-muted text-primary border border-primary px-4 py-2 disabled:opacity-50 cursor-pointer hover:bg-primary hover:text-primary-foreground";
const addressFields: { key: keyof Address; label: string; max: number; autoComplete: string }[] = [
  { key: "cep", label: "CEP", max: 9, autoComplete: "postal-code" },
  { key: "street", label: "Rua / Logradouro", max: 200, autoComplete: "address-line1" },
  { key: "number", label: "Número", max: 20, autoComplete: "off" },
  { key: "complement", label: "Complemento (opcional)", max: 100, autoComplete: "address-line2" },
  { key: "neighborhood", label: "Bairro", max: 100, autoComplete: "off" },
  { key: "city", label: "Cidade", max: 100, autoComplete: "address-level2" },
  { key: "state", label: "Estado / UF", max: 2, autoComplete: "address-level1" }
];

function AccountForm({ user, token, onUpdated, checkoutReturn }: { user: Account; token: string; onUpdated: (token: string, account: Account) => void; checkoutReturn: boolean }) {
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cepChanged, setCepChanged] = useState(false);
  const [cepStatus, setCepStatus] = useState("");
  const edited = useRef(new Set<keyof Address>());
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; pending.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void accountRequest<Profile>(token, "GET", undefined, "/conta", controller.signal).then(profile => {
      if (controller.signal.aborted) return;
      setEmail(profile.account.email);
      setPhone(profile.account.phone ?? "");
      setAddress(profile.address ? { ...profile.address, cep: formatCep(profile.address.cep) } : { ...emptyAddress });
      setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar sua conta. Tente novamente."); });
    return () => controller.abort();
  }, [token, retry]);

  useEffect(() => {
    setCepStatus("");
    const cep = address.cep.replace(/\D/g, "");
    if (!cepChanged || cep.length !== 8) return;
    const controller = new AbortController();
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      setCepStatus("Buscando CEP...");
      timeout = setTimeout(() => controller.abort(), 6000);
      void lookupCep(cep, controller.signal).then(result => {
        if (!active) return;
        setAddress(previous => ({ ...previous, ...Object.fromEntries(Object.entries(result).filter(([key]) => !edited.current.has(key as keyof Address))) }));
        setCepStatus("CEP encontrado. Confira o endereço e informe o número.");
      }).catch(e => {
        if (active) setCepStatus(e instanceof Error && !controller.signal.aborted && e.name !== "TypeError" ? e.message : "Consulta de CEP indisponível. Preencha o endereço manualmente.");
      }).finally(() => clearTimeout(timeout));
    }, 350);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [address.cep, cepChanged]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setCepChanged(false);
    setError(""); setSuccess(""); setSaving(true);
    const controller = new AbortController(); pending.current = controller;
    try {
      const hasAddress = Object.values(address).some(value => value.trim());
      const profile = await accountRequest<Profile>(token, "PATCH", { email, phone: phone.trim() || null, address: hasAddress ? { ...address, cep: address.cep.replace(/\D/g, "") } : null }, "/conta", controller.signal);
      if (!alive.current) return;
      setEmail(profile.account.email);
      setPhone(profile.account.phone ?? "");
      setAddress(profile.address ? { ...profile.address, cep: formatCep(profile.address.cep) } : { ...emptyAddress });
      onUpdated(token, profile.account);
      setSuccess("Alteração salva.");
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { pending.current = null; if (alive.current) setSaving(false); }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setPasswordError(""); setPasswordSuccess("");
    if (passwords.newPassword !== passwords.confirmPassword) { setPasswordError("A confirmação da nova senha não confere."); return; }
    const controller = new AbortController(); pending.current = controller; setSaving(true);
    try {
      await accountRequest(token, "PUT", passwords, "/conta/senha", controller.signal);
      if (!alive.current) return;
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordSuccess("Senha alterada com sucesso.");
      setPasswordOpen(false);
    } catch (e) { if (alive.current) setPasswordError(e instanceof Error ? e.message : "Não foi possível alterar sua senha."); }
    finally { pending.current = null; if (alive.current) setSaving(false); }
  }
  const hasAddress = Object.values(address).some(value => value.trim());
  return <div className="mt-8 max-w-2xl space-y-8">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loaded ? error ? <button className={buttonClass} onClick={() => setRetry(v => v + 1)}>Tentar novamente</button> : <p role="status">Carregando conta...</p> : <>
      <form onSubmit={save}>
        <fieldset disabled={saving} className="space-y-6">
          <section aria-labelledby="personal-title" className="space-y-4">
            <h2 id="personal-title" className="font-serif text-xl font-bold">Dados pessoais</h2>
            <label className="block text-sm font-medium">Nome completo<input className={inputClass + " bg-muted"} value={user.name} readOnly autoComplete="name" /></label>
            <label className="block text-sm font-medium">E-mail<input className={inputClass} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setSuccess(""); }} /></label>
            <label className="block text-sm font-medium">Telefone para contato<input className={inputClass} type="tel" autoComplete="tel" maxLength={40} placeholder="DDD e número, ex.: (11) 99999-9999" value={phone} onChange={e => { setPhone(e.target.value); setSuccess(""); }} /></label>
          </section>
          <section aria-labelledby="address-title" className="space-y-4">
            <h2 id="address-title" className="font-serif text-xl font-bold">Endereço</h2>
            <p className="text-sm text-muted-foreground">Opcional. Se preencher, informe o endereço completo.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addressFields.map(field => <label key={field.key} className="block min-w-0 text-sm font-medium">{field.label}
                <input className={inputClass} value={address[field.key]} maxLength={field.max} autoComplete={field.autoComplete}
                  inputMode={field.key === "cep" ? "numeric" : undefined} pattern={field.key === "cep" ? "[0-9]{5}-[0-9]{3}" : undefined}
                  required={hasAddress && field.key !== "complement"}
                  onChange={e => {
                    const value = field.key === "cep" ? formatCep(e.target.value) : field.key === "state" ? e.target.value.toUpperCase() : e.target.value;
                    if (field.key === "cep") { edited.current.clear(); setCepChanged(true); } else edited.current.add(field.key);
                    setAddress(previous => ({ ...previous, [field.key]: value })); setSuccess("");
                  }} />
              </label>)}
            </div>
            {cepStatus && <p role="status" className="text-sm text-muted-foreground">{cepStatus}</p>}
            <button type="button" className="text-sm underline" onClick={() => { setAddress({ ...emptyAddress }); setCepChanged(false); setSuccess(""); }}>Limpar endereço</button>
          </section>
          <button className={buttonClass} type="submit">{saving ? "Salvando..." : "Salvar alterações"}</button>
          {success && <p role="status" className="text-sm text-green-600">{success}</p>}
          {success && checkoutReturn && <Link to="/checkout" className="inline-flex min-h-11 items-center rounded-lg border border-yellow-400 bg-primary text-primary-foreground px-5 py-2 focus-visible:outline-2 focus-visible:outline-primary">Voltar ao checkout com alterações salvas</Link>}
        </fieldset>
      </form>
      <section aria-labelledby="security-title" className="space-y-4 border-t border-border pt-6">
        <h2 id="security-title" className="font-serif text-xl font-bold">Segurança</h2>
        <button type="button" className={buttonClass} disabled={saving} aria-expanded={passwordOpen} aria-controls="password-form" onClick={() => { setPasswordOpen(v => !v); setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPasswordError(""); setPasswordSuccess(""); }}>Alterar senha</button>
        {passwordSuccess && <p role="status" className="text-sm text-primary">{passwordSuccess}</p>}
        {passwordOpen && <form id="password-form" onSubmit={savePassword}>
          <fieldset disabled={saving} className="space-y-4">
            {([{ key: "currentPassword", label: "Senha atual" }, { key: "newPassword", label: "Nova senha" }, { key: "confirmPassword", label: "Confirmar nova senha" }] as const).map(field => <label key={field.key} className="block text-sm font-medium">{field.label}
              <input type="password" className={inputClass} autoComplete={field.key === "currentPassword" ? "current-password" : "new-password"} minLength={field.key === "currentPassword" ? 1 : 6} maxLength={128} required value={passwords[field.key]} onChange={e => setPasswords(previous => ({ ...previous, [field.key]: e.target.value }))} />
            </label>)}
            {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
            <button type="submit" className={buttonClass}>{saving ? "Salvando..." : "Salvar nova senha"}</button>
          </fieldset>
        </form>}
      </section>
    </>}
  </div>;
}
