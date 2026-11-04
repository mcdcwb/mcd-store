/*
  Warnings:

  - Added the required column `category` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `public` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "colorName" TEXT,
ADD COLUMN     "colorValue" TEXT,
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "public" TEXT NOT NULL;
