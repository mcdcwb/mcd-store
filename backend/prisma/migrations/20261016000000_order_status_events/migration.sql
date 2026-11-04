CREATE TABLE "OrderStatusEvent" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");

ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the initial request time and the latest known status timestamp for
-- existing orders. Older intermediate transition times were not persisted.
INSERT INTO "OrderStatusEvent" ("orderId", "status", "createdAt")
SELECT "id", 'PENDING_CONFIRMATION'::"OrderStatus", "createdAt" FROM "Order";

INSERT INTO "OrderStatusEvent" ("orderId", "status", "createdAt")
SELECT "id", "status", COALESCE("completedAt", "updatedAt") FROM "Order"
WHERE "status" <> 'PENDING_CONFIRMATION'::"OrderStatus";
