export const badgeDefaults = { background: "#2457A7", text: "#FFFFFF" };
export type BadgeSize = "default" | "detail";
// Scale the complete original manual shape proportionally, including its tip.
export const manualBadgeDimensions = { width: 89.6, height: 27.9576 };
export const manualBadgeViewBox = "0 0 112 34.947";
export const badgeShape = "M0,0H94.1125c5.958,0,17.8875,17.4015,17.8875,17.4015s-11.9295,17.5455-17.8875,17.5455H0V0z";
// Draw at the existing half-height, with a shorter shoulder and a rounded tip.
export const automaticBadgeShape = "M0,0H1490Q1515,0 1533,14L1770,174Q1814,194.15 1770,214.3L1533,374.3Q1515,388.3 1490,388.3H0Z";

export function ProductBadge({ label, background = badgeDefaults.background, color = badgeDefaults.text, className = "", size = "default" }: {
  label: string; background?: string; color?: string; className?: string; size?: BadgeSize;
}) {
  const automatic = className.includes("store-badge-automatic");
  const factor = size === "detail" ? 1.5 : 1;
  if (automatic) return <span className={`store-stock-label ${className}`} title={label} aria-live="polite">{label}</span>;
  return <span className={`product-tag ${automatic ? "" : "product-tag-manual"} ${className}`} title={label} data-badge-size={size}
    {...(automatic ? { tabIndex: 0, role: "note", "aria-label": label } : {})}
    style={{ ...(automatic ? { width: (className.includes("store-stock-low") ? 114 : Math.max(62, label.length * 6 + 24) * 1.12) * factor } : { width: manualBadgeDimensions.width * factor, height: manualBadgeDimensions.height * factor }), color }}>
    <svg viewBox={automatic ? "0 0 1792 388.3" : manualBadgeViewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={automatic ? automaticBadgeShape : badgeShape} fill={background} /></svg>
    <span className="product-tag-label"><span>{label}</span></span>
  </span>;
}
