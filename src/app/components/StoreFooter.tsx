
import { businessHoursLines } from "../lib/business-hours";
import { useStoreDetails } from "../hooks/useStoreDetails";

export function StoreFooter({
  store,
}: {
  store: ReturnType<typeof useStoreDetails>;
}) {
  return (
    <footer
      id="contato"
      className="mt-20 border-t border-border bg-secondary"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 text-center md:grid-cols-3 md:text-left">
          <div className="flex flex-col items-center md:items-start">
            <span className="mb-3 text-xl font-bold tracking-widest text-primary">
              MCD STORE
            </span>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Uma loja virtual demonstrativa desenvolvida para portfólio.
            </p>
          </div>

          <div className="flex flex-col items-center md:text-center">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Sobre esta demonstração
            </h4>

            <p className="max-w-sm text-sm leading-relaxed text-foreground/80">
              Este projeto demonstra funcionalidades de uma loja virtual.
              Os contatos comerciais não são exibidos nesta versão pública.
            </p>
          </div>

          <div className="flex flex-col items-center md:items-end md:text-right">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Horário de funcionamento
            </h4>

            <ul className="space-y-2 text-sm text-foreground/80">
              {store.businessHours ? (
                businessHoursLines(store.businessHours).map((line) => (
                  <li key={line}>{line}</li>
                ))
              ) : (
                <li>
                  {store.loading
                    ? "Carregando horários..."
                    : "Horários não configurados nesta demonstração."}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} MCD Store — por Luan Machado.
        </div>
      </div>
    </footer>
  );
}
