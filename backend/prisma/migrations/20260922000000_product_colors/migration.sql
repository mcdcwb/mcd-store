BEGIN;

CREATE TABLE "ProductColor" (

  "id" SERIAL PRIMARY KEY,

  "productId" INTEGER NOT NULL,

  "colorName" TEXT NOT NULL,

  "colorValue" TEXT NOT NULL,

  "imageUrl" TEXT,

  "images" TEXT[] NOT NULL,

  "position" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "ProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE INDEX "ProductColor_productId_idx" ON "ProductColor"("productId");

-- Preserve every product, image and variant ID, including CartItem references.

-- Missing legacy colors receive explicit editable defaults; existing values are retained.

INSERT INTO "ProductColor" ("productId", "colorName", "colorValue", "imageUrl", "images")

SELECT "id", COALESCE("colorName", 'Cor não informada'), COALESCE("colorValue", '#000000'), "imageUrl", COALESCE("images", ARRAY[]::TEXT[]) FROM "Product" ORDER BY "id";

ALTER TABLE "ProductVariant" ADD COLUMN "colorId" INTEGER;

UPDATE "ProductVariant" v SET "colorId" = c."id" FROM "ProductColor" c WHERE c."productId" = v."productId";

ALTER TABLE "ProductVariant" ALTER COLUMN "colorId" SET NOT NULL;

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "ProductVariant_productId_value_key";

ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey", DROP COLUMN "productId";

CREATE UNIQUE INDEX "ProductVariant_colorId_value_key" ON "ProductVariant"("colorId", "value");

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stock_nonnegative" CHECK ("stock" >= 0) NOT VALID;

ALTER TABLE "ProductVariant" VALIDATE CONSTRAINT "ProductVariant_stock_nonnegative";

ALTER TABLE "Product" DROP COLUMN "colorName", DROP COLUMN "colorValue", DROP COLUMN "imageUrl", DROP COLUMN "images";

COMMIT;