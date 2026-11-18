// Como a imagem de cada slide do carrossel é exibida (configurado no painel).
// CONTAIN: imagem inteira sobre fundo desfocado (padrão). COVER: preenche o slide, recortando pelo ponto de foco.
export const carouselImageFits = ["CONTAIN", "COVER"] as const;
export const carouselImageFocuses = ["CENTER", "TOP", "BOTTOM", "LEFT", "RIGHT"] as const;
export type CarouselImageFit = typeof carouselImageFits[number];
export type CarouselImageFocus = typeof carouselImageFocuses[number];
export interface CarouselDisplay { fit: CarouselImageFit; focus: CarouselImageFocus }

export const defaultCarouselDisplay: CarouselDisplay = { fit: "CONTAIN", focus: "CENTER" };
export const carouselFitLabels: Record<CarouselImageFit, string> = { CONTAIN: "Ajustar", COVER: "Preencher" };
export const carouselFocusLabels: Record<CarouselImageFocus, string> = { CENTER: "Centro", TOP: "Topo", BOTTOM: "Base", LEFT: "Esquerda", RIGHT: "Direita" };
export const carouselFocusPositions: Record<CarouselImageFocus, string> = { CENTER: "center", TOP: "top", BOTTOM: "bottom", LEFT: "left", RIGHT: "right" };

// Valores desconhecidos ou ausentes (API antiga, mocks) caem no padrão, sem mudar a aparência atual.
export function parseCarouselDisplay(raw: { carouselImageFit?: unknown; carouselImageFocus?: unknown }): CarouselDisplay {
  const fit = carouselImageFits.find(value => value === raw.carouselImageFit) ?? defaultCarouselDisplay.fit;
  const focus = carouselImageFocuses.find(value => value === raw.carouselImageFocus) ?? defaultCarouselDisplay.focus;
  return { fit, focus };
}
