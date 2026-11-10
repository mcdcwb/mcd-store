-- Conta do painel demonstrativo (somente leitura). Aditiva: admins existentes ficam com isDemo = false.

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

