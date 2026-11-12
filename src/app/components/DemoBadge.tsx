// Etiqueta "DEMO" do modo demonstração (menu da conta da loja e menu lateral do painel).
// É só visual (aria-hidden): o leitor de tela ouve " (modo demonstração)" pelo texto oculto.
// Cores do tema: amarelo na loja, a cor primária do painel no /manager.
export function DemoBadge() {
  return <>
    <span aria-hidden="true" className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-primary px-1.5 py-px align-middle text-[10px] font-bold uppercase leading-4 tracking-wider text-primary-foreground">Demo</span>
    <span className="sr-only"> (modo demonstração)</span>
  </>;
}
