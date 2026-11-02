/** Suggestion counters and retention. Opt-in: see logQueries.db.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { recordSuggestions } from '../../src/services/taste.js';
import { CHAT_KEEP_PER_USER, deleteInBatches, runRetentionSweep } from '../../src/services/retention.js';

const RUN = process.env.DB_TESTS === '1';
const DAY = 86_400_000;

describe.skipIf(!RUN)('suggestion counters and retention (Postgres)', () => {
  let userId = '';
  const recipeIds: string[] = [];

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `grow-${randomUUID()}@example.test`, passwordHash: 'x' } })).id;
    for (const n of [1, 2]) {
      const r = await prisma.recipe.create({
        data: { name: `grow ${n}`, nameLower: `grow ${n}`, category: 'c', cuisine: 'x', instructions: 'i', source: 'AI' },
      });
      recipeIds.push(r.id);
    }
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.$disconnect();
  });

  const counts = async () =>
    Object.fromEntries(
      (await prisma.recipeSuggestion.findMany({ where: { userId } })).map((s) => [s.recipeId, s.count]),
    );

  it('counts suggestions in one row per recipe and skips deleted recipes', async () => {
    await recordSuggestions(userId, [recipeIds[0], recipeIds[1], 'no-such-recipe']);
    await recordSuggestions(userId, [recipeIds[0], recipeIds[0]]); // duplicates in one call count once
    expect(await counts()).toEqual({ [recipeIds[0]]: 2, [recipeIds[1]]: 1 });
    expect(await prisma.userEvent.count({ where: { userId, type: 'suggest' } })).toBe(0);
  });

  it('restarts a count whose last suggestion is outside the window', async () => {
    await prisma.recipeSuggestion.update({
      where: { userId_recipeId: { userId, recipeId: recipeIds[1] } },
      data: { lastAt: new Date(Date.now() - 100 * DAY), count: 9 },
    });
    await recordSuggestions(userId, [recipeIds[1]]);
    expect((await counts())[recipeIds[1]]).toBe(1);
  });

  it('stops batching once a batch comes back short', async () => {
    const sizes = [3, 3, 1, 3];
    let calls = 0;
    const total = await deleteInBatches(async () => sizes[calls++], { batch: 3, pauseMs: 0 });
    expect(total).toBe(7);
    expect(calls).toBe(3);
  });

  it('sweeps old events, expired tokens, stale counts and chat over the cap', async () => {
    const old = new Date(Date.now() - 120 * DAY);
    await prisma.userEvent.createMany({
      data: [
        { userId, type: 'view', weight: 2, createdAt: old },
        { userId, type: 'view', weight: 2 },
      ],
    });
    await prisma.refreshToken.createMany({
      data: [
        { userId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() - DAY) },
        // Revoked but not expired: kept, so token reuse is still detected.
        { userId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + DAY), revokedAt: new Date() },
      ],
    });
    await prisma.recipeSuggestion.update({
      where: { userId_recipeId: { userId, recipeId: recipeIds[0] } },
      data: { lastAt: old },
    });
    await prisma.chatMessage.createMany({
      data: Array.from({ length: CHAT_KEEP_PER_USER + 5 }, (_, i) => ({
        userId,
        role: i % 2 ? 'assistant' : 'user',
        content: `m${i}`,
      })),
    });

    const r = await runRetentionSweep();
    expect(r.events).toBeGreaterThanOrEqual(1);
    expect(await prisma.userEvent.count({ where: { userId } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
    expect(Object.keys(await counts())).toEqual([recipeIds[1]]);

    const chat = await prisma.chatMessage.findMany({ where: { userId }, orderBy: { seq: 'asc' } });
    expect(chat).toHaveLength(CHAT_KEEP_PER_USER);
    expect(chat[0].content).toBe('m5'); // the five oldest went
  });
});
