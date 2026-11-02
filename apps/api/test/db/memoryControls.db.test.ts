/**
 * Forgetting a usual portion, labels standing in for unknown barcodes, and
 * 👍 on recipes. Opt-in: see logQueries.db.test.ts. Open Food Facts is
 * stubbed per test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import {
  forgetDish,
  per100FromLabel,
  productForUser,
  rememberDish,
  rememberLabel,
  savedFoods,
  usualDish,
} from '../../src/services/personalFoods.js';
import { recomputeRecipeQuality } from '../../src/services/recipeQuality.js';

const RUN = process.env.DB_TESTS === '1';

describe.skipIf(!RUN)('memory controls (Postgres)', () => {
  let me = '';
  let other = '';
  const code = `77${Date.now()}`.slice(0, 13);
  const label = {
    productName: 'Local namkeen',
    servingSize: '1 packet (40 g)',
    calories: 200,
    protein: 4,
    carbs: 22,
    fat: 11,
    servingGrams: 40,
  };

  beforeAll(async () => {
    const mk = () => prisma.user.create({ data: { email: `mc-${randomUUID()}@example.test`, passwordHash: 'x' } });
    me = (await mk()).id;
    other = (await mk()).id;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other].filter(Boolean) } } });
    await prisma.barcodeMiss.deleteMany({ where: { barcode: code } });
    await prisma.$disconnect();
  });

  it('forgets a usual portion, by any spelling of the dish', async () => {
    await rememberDish(me, 'Poha with peanuts', [{ name: 'poha', grams: 200 }], { calories: 350, protein: 7, carbs: 55, fat: 11 });
    expect(await forgetDish(other, 'poha with peanuts')).toBe(false);
    expect(await forgetDish(me, 'peanuts poha')).toBe(true);
    expect(await usualDish(me, 'Poha with peanuts')).toBeNull();
  });

  it('works out per-100 g numbers from a per-serving label', () => {
    expect(per100FromLabel(label)).toEqual({ calories: 500, protein: 10, carbs: 55, fat: 27.5 });
    expect(per100FromLabel({ ...label, servingGrams: undefined })).toBeNull();
  });

  it('serves the label a user scanned for a barcode OFF does not know', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await productForUser(me, code)).toBeNull();

    await rememberLabel(me, 'Local namkeen', label, { servings: 1, barcode: code });
    const p = await productForUser(me, code);
    expect(p).toMatchObject({ barcode: code, name: 'Local namkeen', servingGrams: 40, per100g: { calories: 500 } });

    // Only for the user who scanned it.
    expect(await productForUser(other, code)).toBeNull();
    // And it shows in their saved foods, carrying the barcode.
    expect((await savedFoods(me)).find((f) => f.name === 'Local namkeen')?.barcode).toBe(code);
  });

  it('falls back to the user label when OFF is down', async () => {
    await prisma.barcodeMiss.deleteMany({ where: { barcode: code } }); // force an OFF call
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await productForUser(me, code))?.name).toBe('Local namkeen');
    await expect(productForUser(other, code)).rejects.toThrow();
  });

  it('counts one 👍 per person in the quality score', async () => {
    const r = await prisma.recipe.create({
      data: { name: `liked ${code}`, nameLower: `liked ${code}`, category: 'c', cuisine: 'x', instructions: 'i', source: 'AI' },
    });
    await prisma.userEvent.createMany({
      data: [me, me, other].map((userId) => ({ userId, type: 'like', recipeId: r.id, weight: 4 })),
    });
    await recomputeRecipeQuality();
    expect((await prisma.recipe.findUniqueOrThrow({ where: { id: r.id } })).qualityScore).toBe(2);
    await prisma.recipe.delete({ where: { id: r.id } });
  });
});
