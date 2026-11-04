import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  return <section>
    <h3><button type="button" aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}
      className="w-full flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
      {title}<ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button></h3>
    <div id={id} hidden={!expanded}>{children}</div>
  </section>;
}

export function FilterOptions<T extends string>({ options, value, onChange, allValue }: {
  options: readonly { value: T; label: string }[];
  value: T | null; allValue: T | null; onChange: (value: T | null) => void;
}) {
  return <div className="space-y-0.5">
    {[{ value: allValue, label: "Todos" }, ...options].map(option => (
      <button key={option.value ?? "all"} type="button" aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={`store-catalog-control w-full text-left px-3 py-2 rounded-lg text-sm tracking-[0.025em] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${value === option.value ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}>
        {option.label}
      </button>
    ))}
  </div>;
}
