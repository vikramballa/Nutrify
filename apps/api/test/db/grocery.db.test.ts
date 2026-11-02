/** One open grocery item per name. Opt-in: see logQueries.db.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';

const RUN = process.env.DB_TESTS === '1';

describe.skipIf(!RUN)('grocery uniqueness (Postgres)', () => {
  let userId = '';
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `groc-${randomUUID()}@example.test`, passwordHash: 'x' } })).id;
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const open = () => prisma.groceryItem.findMany({ where: { userId, checked: false } });

  it('refuses a second open item with the same name, ignoring case and spaces', async () => {
    await prisma.groceryItem.create({ data: { userId, name: 'Tomatoes' } });
    await expect(prisma.groceryItem.create({ data: { userId, name: ' tomatoes ' } })).rejects.toThrow();
  });

  it('lets racing batch inserts both succeed with no duplicates', async () => {
    const batch = () =>
      prisma.groceryItem.createMany({
        skipDuplicates: true,
        data: ['onion', 'garlic', 'TOMATOES'].map((name) => ({ userId, name })),
      });
    await Promise.all([batch(), batch(), batch()]);
    const names = (await open()).map((i) => i.name.toLowerCase()).sort();
    expect(names).toEqual(['garlic', 'onion', 'tomatoes']);
  });

  it('allows the name again once the old item is ticked off', async () => {
    await prisma.groceryItem.updateMany({ where: { userId, name: 'onion' }, data: { checked: true } });
    await expect(prisma.groceryItem.create({ data: { userId, name: 'onion' } })).resolves.toBeDefined();
  });

  it('keeps goals creation race-safe', async () => {
    const make = () =>
      prisma.nutritionGoals.upsert({ where: { userId }, update: {}, create: { userId } });
    const rows = await Promise.allSettled([make(), make(), make()]);
    // Postgres can still report a unique race on concurrent upserts; at least
    // one must win and exactly one row must exist.
    expect(rows.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await prisma.nutritionGoals.count({ where: { userId } })).toBe(1);
  });
});
