/**
 * Runs against a real Postgres with every migration applied. Opt-in, so a
 * plain `npm test` never writes to a developer's database:
 *
 *   DB_TESTS=1 DATABASE_URL=postgresql://… npx prisma migrate deploy
 *   DB_TESTS=1 DATABASE_URL=postgresql://… npm test -w apps/api
 *
 * Each test file makes its own throwaway user and deletes it (cascading every
 * row it owns) afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { dailyMacroTotals, loggedDays, recentDistinctMeals } from '../../src/services/logQueries.js';
import { computeDailyTotals, dayRange } from '../../src/services/tracking.js';

const RUN = process.env.DB_TESTS === '1';

const DAY = 86_400_000;
const utc = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h));

describe.skipIf(!RUN)('meal-log queries (Postgres)', () => {
  let userId = '';

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `db-test-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const log = (name: string, at: Date, calories = 100) =>
    prisma.mealLog.create({
      data: { userId, name, mealType: 'lunch', calories, protein: 10, carbs: 20, fat: 5, at },
    });

  it('sums macros per UTC day and matches the old in-JS totals', async () => {
    await log('idli', utc(2026, 3, 1, 0)); // first second of the day
    await log('dosa', utc(2026, 3, 1, 23), 250);
    await log('dal', utc(2026, 3, 3), 300);
    await log('outside', utc(2026, 3, 5), 999); // after the window

    const start = utc(2026, 3, 1, 0);
    const end = utc(2026, 3, 4, 0);
    const rows = await dailyMacroTotals(userId, start, end);
    expect(rows).toEqual([
      { at: utc(2026, 3, 1, 0), calories: 350, protein: 20, carbs: 40, fat: 10 },
      { at: utc(2026, 3, 3, 0), calories: 300, protein: 10, carbs: 20, fat: 5 },
    ]);

    const raw = await prisma.mealLog.findMany({ where: { userId, at: { gte: start, lt: end } } });
    const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
    expect(computeDailyTotals(days, rows)).toEqual(computeDailyTotals(days, raw));
  });

  it('lists each logged day once', async () => {
    const days = await loggedDays(userId, utc(2026, 3, 1, 0));
    expect(days).toEqual([utc(2026, 3, 1, 0), utc(2026, 3, 3, 0), utc(2026, 3, 5, 0)]);
  });

  it('returns the newest dishes first, even past 50 distinct names', async () => {
    const base = Date.now() - 20 * DAY;
    // 55 old dishes early in the alphabet, then two recent ones late in it:
    // the old name-sorted cap of 50 dropped exactly these two.
    for (let i = 0; i < 55; i++) await log(`a-dish-${String(i).padStart(2, '0')}`, new Date(base + i * 60_000));
    await log('zucchini curry', new Date(Date.now() - 2 * DAY));
    await log('zucchini curry', new Date(Date.now() - DAY)); // newer repeat
    await log('yam fry', new Date(Date.now() - 3 * DAY));

    const recent = await recentDistinctMeals(userId, new Date(Date.now() - 30 * DAY), 6);
    expect(recent.map((r) => r.name).slice(0, 2)).toEqual(['zucchini curry', 'yam fry']);
    expect(recent[0].at.getTime()).toBeGreaterThan(Date.now() - 1.5 * DAY);
    expect(new Set(recent.map((r) => r.name)).size).toBe(recent.length);
    expect(recent).toHaveLength(6);
  });

  it('keeps the daily window consistent with dayRange()', async () => {
    const range = dayRange(7);
    const rows = await dailyMacroTotals(userId, range.start, range.endExclusive);
    expect(computeDailyTotals(range.days, rows)).toHaveLength(7);
  });
});

describe.skipIf(!RUN)('indexes (Postgres)', () => {
  afterAll(() => prisma.$disconnect());

  /** index name → its definition, for one table. */
  async function indexes(table: string): Promise<Map<string, string>> {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ${table}`;
    return new Map(rows.map((r) => [r.indexname, r.indexdef]));
  }

  // Exact definitions rather than EXPLAIN output: on near-empty test tables
  // the planner's choice says nothing about production, but a wrong or
  // missing index is always a bug.
  it.each([
    ['MealLog', 'MealLog_userId_name_at_idx', '("userId", name, at DESC)'],
    ['Ingredient', 'Ingredient_recipeId_position_idx', '("recipeId", "position")'],
    ['GroceryItem', 'GroceryItem_userId_recipeId_idx', '("userId", "recipeId")'],
    ['UserEvent', 'UserEvent_userId_type_createdAt_idx', '("userId", type, "createdAt")'],
  ])('%s has %s', async (table, name, columns) => {
    const def = (await indexes(table)).get(name);
    expect(def).toBeDefined();
    expect(def).toContain(columns);
  });

  it.each([
    ['UserEvent', 'UserEvent_recipeId_idx'],
    ['Ingredient', 'Ingredient_recipeId_idx'],
  ])('%s no longer has %s', async (table, name) => {
    expect((await indexes(table)).has(name)).toBe(false);
  });

  it('every index is valid (no half-built CONCURRENTLY leftovers)', async () => {
    const bad = await prisma.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE NOT i.indisvalid`;
    expect(bad).toEqual([]);
  });
});
