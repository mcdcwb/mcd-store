ALTER TABLE "StoreSettings"
  ADD COLUMN "showLowStockBadge" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showLastUnitBadge" BOOLEAN NOT NULL DEFAULT true;
