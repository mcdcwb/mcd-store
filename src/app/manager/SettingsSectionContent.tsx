import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SettingsSectionContent({ title, headingId, className = "", children }: {
  title: string; headingId?: string; className?: string; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return <>
    <h2 id={headingId} className={`text-lg font-semibold ${expanded ? className : ""}`}>
      <button type="button" aria-expanded={expanded} aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${expanded ? "" : "h-11 text-sm min-[390px]:text-lg"}`}>
        <span className={`min-w-0 ${expanded ? "break-words" : "truncate"}`}>{title}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
      </button>
    </h2>
    <div id={contentId} hidden={!expanded}>{children}</div>
  </>;
}
