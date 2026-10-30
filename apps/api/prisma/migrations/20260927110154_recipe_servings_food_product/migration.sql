-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "servings" INTEGER;

-- CreateTable
CREATE TABLE "FoodProduct" (
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "servingGrams" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodProduct_pkey" PRIMARY KEY ("barcode")
);
