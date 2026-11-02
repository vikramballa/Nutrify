-- Unused: no foreign key, no query filters on recipeId alone.
DROP INDEX CONCURRENTLY IF EXISTS "UserEvent_recipeId_idx";
