-- Marca clientes e pedidos fictícios do seed demonstrativo (prisma/seed-demo-orders.ts).
-- Aditiva: registros existentes ficam com isDemo = false.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Order_isDemo_idx" ON "Order"("isDemo");

