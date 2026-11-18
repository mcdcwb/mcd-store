import { ProductImage } from "./ProductImage";
import { carouselFocusPositions, type CarouselDisplay } from "../lib/carousel-display";

// Imagem de um slide do carrossel. Usada na home e na pré-visualização do painel,
// para que as miniaturas mostrem exatamente o mesmo recorte do slide real.
export function CarouselSlideImage({ src, alt, display, imageClassName = "" }: { src: string | undefined; alt: string; display: CarouselDisplay; imageClassName?: string }) {
  if (display.fit === "COVER") {
    return <ProductImage src={src} alt={alt} data-carousel-fit="COVER" data-carousel-focus={display.focus}
      style={{ objectPosition: carouselFocusPositions[display.focus] }}
      className={`${imageClassName} relative h-full w-full object-cover`} />;
  }
  return <>
    <ProductImage src={src} alt="" aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75" />
    <ProductImage src={src} alt={alt} data-carousel-fit="CONTAIN"
      className={`${imageClassName} relative h-full w-full object-contain`} />
  </>;
}
