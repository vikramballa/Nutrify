-- AlterTable: when each product was last read from Open Food Facts.
ALTER TABLE "FoodProduct" ADD COLUMN "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FoodProduct" SET "fetchedAt" = "createdAt";

-- CreateTable
CREATE TABLE "BarcodeMiss" (
    "barcode" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarcodeMiss_pkey" PRIMARY KEY ("barcode")
);
