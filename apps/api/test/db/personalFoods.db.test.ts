/** Usual dish portions and saved foods. Opt-in: see logQueries.db.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import {
  forgetFood,
  rememberBarcode,
  rememberDish,
  rememberLabel,
  savedFoods,
  usualDish,
  usualGramsFor,
} from '../../src/services/personalFoods.js';

const RUN = process.env.DB_TESTS === '1';

describe.skipIf(!RUN)('personal food memory (Postgres)', () => {
  let me = '';
  let other = '';
  const label = {
    productName: 'Marie biscuits',
    servingSize: '4 biscuits (25 g)',
    calories: 110,
    protein: 2,
    carbs: 19,
    fat: 3,
    per100g: { calories: 440, protein: 8, carbs: 76, fat: 12 },
    servingGrams: 25,
    source: 'device' as const,
  };

  beforeAll(async () => {
    const mk = () => prisma.user.create({ data: { email: `pf-${randomUUID()}@example.test`, passwordHash: 'x' } });
    me = (await mk()).id;
    other = (await mk()).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it('remembers the last logged portion of a dish, whatever the word order', async () => {
    const macros = { calories: 300, protein: 9, carbs: 50, fat: 6 };
    await rememberDish(me, 'Idli with Sambar', [{ name: 'idli', grams: 80, count: 2 }], macros);
    await rememberDish(me, 'sambar idli', [{ name: 'idli', grams: 120, count: 3 }, { name: 'sambar', grams: 150 }], {
      ...macros,
      calories: 420,
    });
    const usual = await usualDish(me, 'IDLI & SAMBAR');
    expect(usual).toMatchObject({ calories: 420, timesEaten: 2 });
    expect(usual?.items.map((i) => i.count ?? 1)).toEqual([3, 1]);
  });

  it("never shows one user's dishes to another", async () => {
    expect(await usualDish(other, 'idli sambar')).toBeNull();
  });

  it('saves a logged label and how much was eaten', async () => {
    await rememberLabel(me, 'Marie biscuits', label, { grams: 50 });
    await rememberLabel(me, 'marie BISCUITS', label, { grams: 75 }); // same food, new amount
    const foods = await savedFoods(me);
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ usualGrams: 75, timesLogged: 2, label: { per100g: { calories: 440 } } });
  });

  it('remembers barcode portions separately from labels', async () => {
    await rememberBarcode(me, '8901063010192', 'Some Chips', 30);
    expect(await usualGramsFor(me, '8901063010192')).toBe(30);
    expect(await usualGramsFor(other, '8901063010192')).toBeNull();
    expect((await savedFoods(me)).map((f) => f.name)).toEqual(['marie BISCUITS']); // name as last typed
  });

  it('only lets the owner forget a food', async () => {
    const [food] = await savedFoods(me);
    expect(await forgetFood(other, food.id)).toBe(false);
    expect(await forgetFood(me, food.id)).toBe(true);
    expect(await savedFoods(me)).toEqual([]);
  });

  it('is deleted with the account', async () => {
    const u = await prisma.user.create({ data: { email: `pf-${randomUUID()}@example.test`, passwordHash: 'x' } });
    await rememberDish(u.id, 'dal rice', [{ name: 'dal', grams: 150 }], { calories: 1, protein: 1, carbs: 1, fat: 1 });
    await rememberBarcode(u.id, '123456789012', 'x', 10);
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.userDish.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.userFood.count({ where: { userId: u.id } })).toBe(0);
  });
});
