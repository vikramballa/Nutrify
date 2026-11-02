-- Grocery items looked up by (user, recipe).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GroceryItem_userId_recipeId_idx" ON "GroceryItem"("userId", "recipeId");
