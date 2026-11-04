ALTER TABLE "Product" ADD COLUMN "carouselPosition" INTEGER NOT NULL DEFAULT 0;

WITH ordered_carousel AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id")::INTEGER - 1 AS position
  FROM "Product"
  WHERE "inCarousel" = TRUE
)
UPDATE "Product" AS product
SET "carouselPosition" = ordered_carousel.position
FROM ordered_carousel
WHERE product."id" = ordered_carousel."id";
