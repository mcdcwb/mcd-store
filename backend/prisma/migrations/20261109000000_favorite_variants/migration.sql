-- Favoritos passam a guardar a combinação produto + cor + tamanho.
-- Os favoritos existentes ficam com "colorId" e "size" NULL e continuam válidos.
-- Requer Postgres 15+ (NULLS NOT DISTINCT): local 16 (Docker) e Neon 18.

-- AlterTable
ALTER TABLE "AdminFavorite" DROP CONSTRAINT "AdminFavorite_pkey",
ADD COLUMN     "colorId" INTEGER,
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "size" TEXT,
ADD CONSTRAINT "AdminFavorite_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_pkey",
ADD COLUMN     "colorId" INTEGER,
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "size" TEXT,
ADD CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "AdminFavorite_colorId_idx" ON "AdminFavorite"("colorId");

-- CreateIndex (editado à mão: NULLS NOT DISTINCT para que "cor sem tamanho" e
-- favoritos antigos sem cor também não se repitam; o Prisma não gera isso).
CREATE UNIQUE INDEX "AdminFavorite_adminId_productId_colorId_size_key" ON "AdminFavorite"("adminId", "productId", "colorId", "size") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "Favorite_colorId_idx" ON "Favorite"("colorId");

-- CreateIndex (editado à mão: NULLS NOT DISTINCT, ver acima).
CREATE UNIQUE INDEX "Favorite_userId_productId_colorId_size_key" ON "Favorite"("userId", "productId", "colorId", "size") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFavorite" ADD CONSTRAINT "AdminFavorite_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
