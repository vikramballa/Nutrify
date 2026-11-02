import { prisma } from '../lib/prisma.js';

/**
 * The daily clean-up of rows nothing reads any more.
 *
 * Deletes run in batches: one DELETE of a month of events holds its locks and
 * writes its whole undo log at once, stalling the inserts the app makes all
 * day. Small batches with a pause between them let normal traffic through.
 *
 * Revoked refresh tokens are NOT deleted early: a revoked token being
 * presented again is how token theft is detected (the whole family is then
 * revoked), so each one is kept until it expires anyway.
 */
export const EVENT_RETENTION_DAYS = 90;
/** Matches the taste window: an older suggestion count is never read. */
export const SUGGESTION_RETENTION_DAYS = 90;
/** Ask NutriChef keeps the newest this many messages per user. */
export const CHAT_KEEP_PER_USER = 500;

const BATCH = 5000;
/** Safety stop per table per sweep (BATCH × this rows); the rest waits a day. */
const MAX_BATCHES = 200;
const PAUSE_MS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `deleteBatch` until it removes fewer than BATCH rows. Returns the total. */
export async function deleteInBatches(
  deleteBatch: (limit: number) => Promise<number>,
  { batch = BATCH, maxBatches = MAX_BATCHES, pauseMs = PAUSE_MS } = {},
): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await deleteBatch(batch);
    total += n;
    if (n < batch) break;
    if (pauseMs) await sleep(pauseMs);
  }
  return total;
}

export interface SweepResult {
  events: number;
  refreshTokens: number;
  suggestions: number;
  chatMessages: number;
}

export async function runRetentionSweep(now = new Date()): Promise<SweepResult> {
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const eventCutoff = daysAgo(EVENT_RETENTION_DAYS);
  const suggestionCutoff = daysAgo(SUGGESTION_RETENTION_DAYS);

  const events = await deleteInBatches(
    (limit) => prisma.$executeRaw`
      DELETE FROM "UserEvent" WHERE "id" IN (
        SELECT "id" FROM "UserEvent" WHERE "createdAt" < ${eventCutoff} LIMIT ${limit})`,
  );
  const refreshTokens = await deleteInBatches(
    (limit) => prisma.$executeRaw`
      DELETE FROM "RefreshToken" WHERE "id" IN (
        SELECT "id" FROM "RefreshToken" WHERE "expiresAt" < ${now} LIMIT ${limit})`,
  );
  const suggestions = await deleteInBatches(
    (limit) => prisma.$executeRaw`
      DELETE FROM "RecipeSuggestion" WHERE ("userId", "recipeId") IN (
        SELECT "userId", "recipeId" FROM "RecipeSuggestion" WHERE "lastAt" < ${suggestionCutoff} LIMIT ${limit})`,
  );
  // Per user, everything older than their newest CHAT_KEEP_PER_USER messages.
  // Only users over the cap are ranked, via (userId, seq).
  const chatMessages = await prisma.$executeRaw`
    DELETE FROM "ChatMessage" c
    USING (
      SELECT ranked."userId", ranked."seq" AS cutoff
      FROM (
        SELECT m."userId", m."seq", row_number() OVER (PARTITION BY m."userId" ORDER BY m."seq" DESC) AS rn
        FROM "ChatMessage" m
        WHERE m."userId" IN (
          SELECT "userId" FROM "ChatMessage" GROUP BY "userId" HAVING count(*) > ${CHAT_KEEP_PER_USER})
      ) ranked
      WHERE ranked.rn = ${CHAT_KEEP_PER_USER}
    ) keep
    WHERE c."userId" = keep."userId" AND c."seq" < keep.cutoff`;

  return { events, refreshTokens, suggestions, chatMessages };
}
