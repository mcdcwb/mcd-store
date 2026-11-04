import { FavoriteBookmark } from "./icons/FavoriteBookmark";
import { useId } from "react";

export function ProductFavoriteButton({ liked, onFavorite, favoriteBusy, favoritePending }: {
  liked: boolean;
  onFavorite: () => void;
  favoriteBusy: boolean;
  favoritePending: boolean;
}) {
  const tooltipId = useId();
  const tooltip = liked ? "Desfavoritar" : "Adicionar aos Favoritos";
  return <div className="store-favorite-layer pointer-events-none absolute inset-0 z-20">
    <button
      onClick={event => { event.stopPropagation(); onFavorite(); }}
      disabled={favoriteBusy}
      aria-busy={favoritePending}
      aria-pressed={liked}
      type="button"
      className="store-favorite-bookmark pointer-events-auto absolute -top-px -right-px z-20 flex h-11 w-11 items-start justify-end rounded-none border-0 bg-transparent p-0 outline-none focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
      aria-label={liked ? "Remover dos favoritos" : "Favoritar"}
      aria-describedby={tooltipId}
    >
      <FavoriteBookmark filled={liked} />
      <span className="store-favorite-tooltip" id={tooltipId} role="tooltip">{tooltip}</span>
    </button>
  </div>;
}
