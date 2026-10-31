-- AlterTable
ALTER TABLE "GroceryItem" ADD COLUMN     "quantity" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "declaredServings" INTEGER,
ADD COLUMN     "servingGrams" INTEGER;
