CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreSettings_singleton" CHECK ("id" = 1),
    CONSTRAINT "StoreSettings_threshold_range" CHECK ("lowStockThreshold" BETWEEN 1 AND 9999)
);

INSERT INTO "StoreSettings" ("id", "lowStockThreshold") VALUES (1, 5);
