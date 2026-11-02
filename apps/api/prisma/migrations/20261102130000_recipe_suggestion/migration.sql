-- CreateTable
CREATE TABLE "RecipeSuggestion" (
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeSuggestion_pkey" PRIMARY KEY ("userId","recipeId"),
    CONSTRAINT "RecipeSuggestion_count_check" CHECK ("count" >= 1)
);

-- CreateIndex
CREATE INDEX "RecipeSuggestion_userId_lastAt_idx" ON "RecipeSuggestion"("userId", "lastAt");

-- CreateIndex
CREATE INDEX "RecipeSuggestion_recipeId_idx" ON "RecipeSuggestion"("recipeId");

-- AddForeignKey
ALTER TABLE "RecipeSuggestion" ADD CONSTRAINT "RecipeSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeSuggestion" ADD CONSTRAINT "RecipeSuggestion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over what the old 'suggest' events already know, so ignored-
-- suggestion penalties don't reset on deploy. (Users always exist: UserEvent
-- cascades with User. Recipes may be gone: their events are skipped.) The
-- old rows themselves are left to age out with the 90-day retention sweep.
INSERT INTO "RecipeSuggestion" ("userId", "recipeId", "count", "firstAt", "lastAt")
SELECT e."userId", e."recipeId", count(*)::int, min(e."createdAt"), max(e."createdAt")
FROM "UserEvent" e
JOIN "Recipe" r ON r."id" = e."recipeId"
WHERE e."type" = 'suggest'
GROUP BY e."userId", e."recipeId";

-- UserEvent takes inserts all day and deletes once a day; the default
-- thresholds (20% of the table changed) let dead rows and stale planner
-- statistics pile up on a large table. Clean and re-analyse sooner.
ALTER TABLE "UserEvent" SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "MealLog" SET (autovacuum_analyze_scale_factor = 0.02);
