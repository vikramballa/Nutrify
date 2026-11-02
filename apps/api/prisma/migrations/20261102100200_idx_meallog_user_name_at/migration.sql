-- Newest row per dish for /logs/recent.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MealLog_userId_name_at_idx" ON "MealLog"("userId", "name", "at" DESC);
