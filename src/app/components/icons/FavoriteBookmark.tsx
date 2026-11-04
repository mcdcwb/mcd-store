const shape = "M21.3,28.3L16,23l-5.3,5.3C10.1,28.9,9,28.5,9,27.6V5c0-0.6,0.4-1,1-1h12c0.6,0,1,0.4,1,1v22.6 C23,28.5,21.9,28.9,21.3,28.3z";

export function FavoriteBookmark({ filled }: { filled: boolean }) {
  // At 1.25x, the supplied drawing is about 19 x 32px. Offset its empty
  // viewBox margins; the button sits over the card border, with the visual edge 8px from its right.
  return <svg width="40" height="40" viewBox="0 0 32 32" className="pointer-events-none absolute -top-[4.4px] -right-[2.65px]" aria-hidden="true" focusable="false">
    <path data-bookmark-shape d={shape} fill={filled ? "#c61010" : "rgba(0, 0, 0, 0.35)"} stroke={filled ? "#c61010" : "#B7BEC3"} strokeWidth="0.96" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
