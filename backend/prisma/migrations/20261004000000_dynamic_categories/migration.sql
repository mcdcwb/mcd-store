BEGIN;
CREATE TABLE "Category" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_name_valid" CHECK (length("name") BETWEEN 1 AND 80 AND "name" = btrim("name"))
);
CREATE UNIQUE INDEX "Category_normalizedName_key" ON "Category"("normalizedName");

-- Fail atomically on invalid legacy names rather than losing associations.
INSERT INTO "Category" ("name", "normalizedName", "updatedAt")
SELECT min(btrim(category)), lower(normalize(regexp_replace(btrim(category), '\s+', ' ', 'g'), NFKC)), CURRENT_TIMESTAMP
FROM "Product"
GROUP BY lower(normalize(regexp_replace(btrim(category), '\s+', ' ', 'g'), NFKC));

ALTER TABLE "Product" ADD COLUMN "categoryId" INTEGER;
ALTER TABLE "Product" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Product" p SET "categoryId" = c.id FROM "Category" c
WHERE c."normalizedName" = lower(normalize(regexp_replace(btrim(p.category), '\s+', ' ', 'g'), NFKC));
ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Remove the old link only after every row has a required foreign key.
ALTER TABLE "Product" DROP COLUMN "category";
COMMIT;
