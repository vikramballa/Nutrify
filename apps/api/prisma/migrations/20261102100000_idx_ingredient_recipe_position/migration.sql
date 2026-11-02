-- Built without locking writes. One statement per migration: CONCURRENTLY
-- cannot run inside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ingredient_recipeId_position_idx" ON "Ingredient"("recipeId", "position");
