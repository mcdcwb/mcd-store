import { useState } from "react";
import { SettingsSectionContent } from "./SettingsSectionContent";
import type { StockBadgeSettings } from "../../../backend/src/lib/stock-badges";
import { Button } from "../components/ui/button";

export function SettingsPage({ settings, saving, onSave }: { settings: StockBadgeSettings; saving: boolean; onSave: (value: StockBadgeSettings) => Promise<boolean> }) {
  const threshold = settings.lowStockThreshold;
  const [value, setValue] = useState(String(threshold));
  const [showLowStockBadge, setShowLowStockBadge] = useState(settings.showLowStockBadge);
  const [showLastUnitBadge, setShowLastUnitBadge] = useState(settings.showLastUnitBadge);
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999;
  return <>
    <div className="mb-8"><h1 className="font-serif text-3xl font-bold">Configurações</h1><p className="text-muted-foreground mt-2">Gerencie as preferências do painel administrativo.</p></div>
    <form noValidate className="max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8" onSubmit={async event => {
      event.preventDefault();
      if (!valid) { setError("Informe um número inteiro entre 1 e 9999."); return; }
      setError(null);
      await onSave({ lowStockThreshold: parsed, showLowStockBadge, showLastUnitBadge });
    }}>
      <SettingsSectionContent title="Estoque" className="mb-5">
      <label htmlFor="low-stock-threshold" className="block text-sm font-medium mb-2">Definir limite de <i>estoque baixo</i></label>
      <input id="low-stock-threshold" type="number" min={1} max={9999} step={1} required value={value} disabled={saving} aria-invalid={!!error} aria-describedby={`threshold-help${error ? " threshold-error" : ""}`} onChange={event => { setValue(event.target.value); setError(null); }} className="h-11 w-full max-w-48 rounded-lg border border-border bg-background px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50" />
      <p id="threshold-help" className="text-sm text-muted-foreground mt-3">{valid ? `Variantes com estoque entre 1 e ${parsed} unidades serão consideradas com estoque baixo.` : "Escolha um limite inteiro entre 1 e 9999 unidades."} Estoque zero continua sendo classificado como sem estoque.</p>
      {error && <p id="threshold-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <fieldset className="mt-5 space-y-2" disabled={saving}>
        <legend className="mb-2 text-sm font-medium">Badges automáticos</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={showLowStockBadge} onChange={event => setShowLowStockBadge(event.target.checked)} className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
          Exibir badge "Poucas unidades"
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={showLastUnitBadge} onChange={event => setShowLastUnitBadge(event.target.checked)} className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
          Exibir badge "Última peça"
        </label>
      </fieldset>
      <Button type="submit" disabled={saving || (valid && parsed === threshold && showLowStockBadge === settings.showLowStockBadge && showLastUnitBadge === settings.showLastUnitBadge)} aria-busy={saving} className="mt-6 h-auto min-h-11 rounded-lg px-5 py-2.5 font-semibold">{saving ? "Salvando..." : "Salvar alterações"}</Button>
      </SettingsSectionContent>
    </form>
  </>;
}
