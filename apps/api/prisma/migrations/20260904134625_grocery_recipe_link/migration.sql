-- AlterTable
ALTER TABLE "GroceryItem" ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "recipeName" TEXT;

-- CreateIndex
CREATE INDEX "GroceryItem_recipeId_idx" ON "GroceryItem"("recipeId");

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
