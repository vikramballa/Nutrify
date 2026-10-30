-- DropIndex
DROP INDEX "Recipe_cuisine_idx";

-- CreateIndex
CREATE INDEX "Recipe_cuisine_name_idx" ON "Recipe"("cuisine", "name");

-- CreateIndex
CREATE INDEX "UserEvent_userId_type_createdAt_idx" ON "UserEvent"("userId", "type", "createdAt");
