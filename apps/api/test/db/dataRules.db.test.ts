/** Postgres-enforced data rules. Opt-in: see logQueries.db.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';

const RUN = process.env.DB_TESTS === '1';

describe.skipIf(!RUN)('data rules (Postgres)', () => {
  let userId = '';

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `rules-${randomUUID()}@example.test`, passwordHash: 'x' } })).id;
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const meal = (over: Record<string, unknown>) =>
    prisma.mealLog.create({
      data: { userId, name: 'x', mealType: 'lunch', calories: 1, protein: 1, carbs: 1, fat: 1, ...over },
    });

  it.each([
    ['an unknown meal type', () => meal({ mealType: 'brunch' })],
    ['negative calories', () => meal({ calories: -1 })],
    ['zero water', () => prisma.waterLog.create({ data: { userId, date: new Date('2026-01-01'), ml: 0 } })],
    ['an impossible weight', () => prisma.weightEntry.create({ data: { userId, date: new Date('2026-01-01'), kg: 5 } })],
    ['an unknown chat role', () => prisma.chatMessage.create({ data: { userId, role: 'system', content: 'x' } })],
    ['an empty plan entry', () => prisma.mealPlanEntry.create({ data: { userId, date: new Date('2026-01-01'), slot: 'lunch' } })],
    ['an unknown event type', () => prisma.userEvent.create({ data: { userId, type: 'hack', weight: 1 } })],
    ['an unknown profile goal', () => prisma.user.update({ where: { id: userId }, data: { goal: 'bulk' } })],
  ])('rejects %s', async (_label, write) => {
    await expect(write()).rejects.toThrow(/check constraint/i);
  });

  it('accepts valid rows and optional NULLs', async () => {
    await expect(meal({})).resolves.toBeDefined();
    await expect(
      prisma.recipe.create({
        data: { name: 'r', nameLower: 'r', category: 'c', cuisine: 'x', instructions: 'i', source: 'AI' },
      }),
    ).resolves.toMatchObject({ calories: null, servings: null });
    await prisma.recipe.deleteMany({ where: { nameLower: 'r', category: 'c', cuisine: 'x' } });
  });

  it('stores days as calendar dates (UTC midnight back in JS)', async () => {
    const w = await prisma.weightEntry.create({ data: { userId, date: new Date('2026-02-03T00:00:00Z'), kg: 70 } });
    expect(w.date.toISOString()).toBe('2026-02-03T00:00:00.000Z');
    // Same day, any time of day: one weigh-in.
    await expect(
      prisma.weightEntry.create({ data: { userId, date: new Date('2026-02-03T00:00:00Z'), kg: 71 } }),
    ).rejects.toThrow(/unique/i);
  });

  it('every rule is validated on a fresh database', async () => {
    const pending = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND NOT convalidated`;
    expect(pending).toEqual([]);
  });
});
