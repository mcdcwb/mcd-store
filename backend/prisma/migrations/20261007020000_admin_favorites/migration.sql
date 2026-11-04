CREATE TABLE "AdminFavorite" (
  "adminId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  CONSTRAINT "AdminFavorite_pkey" PRIMARY KEY ("adminId", "productId")
);
CREATE INDEX "AdminFavorite_productId_idx" ON "AdminFavorite"("productId");
ALTER TABLE "AdminFavorite" ADD CONSTRAINT "AdminFavorite_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminFavorite" ADD CONSTRAINT "AdminFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
