-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- DropIndex
DROP INDEX "Recipe_nameLower_idx";

-- CreateIndex
CREATE INDEX "Favorite_recipeId_idx" ON "Favorite"("recipeId");

-- CreateIndex
CREATE INDEX "GroceryItem_userId_createdAt_idx" ON "GroceryItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Ingredient_recipeId_idx" ON "Ingredient"("recipeId");

-- CreateIndex
CREATE INDEX "MealLog_recipeId_idx" ON "MealLog"("recipeId");

-- CreateIndex
CREATE INDEX "MealPlanEntry_recipeId_idx" ON "MealPlanEntry"("recipeId");

-- CreateIndex
CREATE INDEX "Recipe_cuisine_idx" ON "Recipe"("cuisine");

-- CreateIndex
CREATE INDEX "Recipe_nameLower_trgm_idx" ON "Recipe" USING GIN ("nameLower" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SearchTerm_recipeId_idx" ON "SearchTerm"("recipeId");

-- CreateIndex
CREATE INDEX "UserEvent_recipeId_idx" ON "UserEvent"("recipeId");

-- CreateIndex
CREATE INDEX "UserEvent_createdAt_idx" ON "UserEvent"("createdAt");
