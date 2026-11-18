-- Modo de exibição da imagem de cada slide do carrossel.
-- Slides existentes ficam em CONTAIN/CENTER (comportamento anterior: imagem inteira com fundo desfocado).
CREATE TYPE "CarouselImageFit" AS ENUM ('CONTAIN', 'COVER');
CREATE TYPE "CarouselImageFocus" AS ENUM ('CENTER', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT');

ALTER TABLE "Product"
  ADD COLUMN "carouselImageFit" "CarouselImageFit" NOT NULL DEFAULT 'CONTAIN',
  ADD COLUMN "carouselImageFocus" "CarouselImageFocus" NOT NULL DEFAULT 'CENTER';
