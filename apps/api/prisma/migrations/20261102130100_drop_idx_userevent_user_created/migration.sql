-- Unused since every UserEvent read filters by type: (userId, type,
-- createdAt) serves them, and retention uses (createdAt).
DROP INDEX CONCURRENTLY IF EXISTS "UserEvent_userId_createdAt_idx";
