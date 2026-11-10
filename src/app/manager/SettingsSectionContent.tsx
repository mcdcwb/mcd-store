import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Tipografia do título dos cards de Configurações, definida num lugar só e IGUAL nos dois estados.
// Fica no <button>: a regra base global `button { font-size; font-weight; line-height }` (theme.css)
// não herda do <h2>, então o estilo precisa estar no próprio botão.
const titleClass = "text-lg font-semibold leading-7";

// Acordeão acessível: <h2> com o <button aria-expanded aria-controls> dentro. Abrir/fechar muda só a
// seta; o cabeçalho tem sempre a mesma altura e o espaço até o conteúdo fica no bloco de conteúdo.
export function SettingsSectionContent({ title, headingId, contentClassName = "", children }: {
  title: string; headingId?: string; contentClassName?: string; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return <>
    <h2 id={headingId} className={titleClass}>
      <button type="button" aria-expanded={expanded} aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${titleClass}`}>
        <span className="min-w-0 break-words">{title}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
      </button>
    </h2>
    <div id={contentId} hidden={!expanded} className={contentClassName}>{children}</div>
  </>;
}
