/**
 * Fuzzy recipe matching, recipe quality and barcode memory against a real
 * Postgres. Opt-in: see logQueries.db.test.ts. TheMealDB, the AI chain and
 * Open Food Facts are stubbed, so nothing leaves the machine.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../src/services/mealdb.js', () => ({
  searchMeals: vi.fn(async () => []),
  randomMeals: vi.fn(async () => []),
  mealsByArea: vi.fn(async () => []),
}));
vi.mock('../../src/services/ai/index.js', () => ({
  aiComplete: vi.fn(async () => {
    throw new Error('no AI in tests');
  }),
}));

const { prisma } = await import('../../src/lib/prisma.js');
const { browse, getRandom, search, similarRecipes } = await import('../../src/services/recipeService.js');
const { recomputeRecipeQuality } = await import('../../src/services/recipeQuality.js');
const { lookupBarcode, refreshProduct } = await import('../../src/services/foodProducts.js');

const RUN = process.env.DB_TESTS === '1';
const tag = randomUUID().slice(0, 6); // keeps these names apart from other tests' rows

describe.skipIf(!RUN)('learning (Postgres)', () => {
  const recipeIds: string[] = [];
  const userIds: string[] = [];

  const recipe = async (name: string, source = 'AI') => {
    const r = await prisma.recipe.create({
      data: { name, nameLower: name.toLowerCase(), category: 'Main', cuisine: 'Indian', instructions: 'i', source },
    });
    recipeIds.push(r.id);
    return r;
  };
  const user = async () => {
    const u = await prisma.user.create({ data: { email: `learn-${randomUUID()}@example.test`, passwordHash: 'x' } });
    userIds.push(u.id);
    return u;
  };

  beforeAll(async () => {
    await recipe(`Gongura Chicken ${tag}`);
    await recipe(`Chicken Biryani ${tag}`, 'MEALDB');
  });
  afterAll(async () => {
    await prisma.searchTerm.deleteMany({ where: { recipeId: { in: recipeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.$disconnect();
  });

  describe('fuzzy match before AI generation', () => {
    it('finds a close spelling and not a different dish', async () => {
      expect((await similarRecipes(`gongura chiken ${tag}`, 5)).map((r) => r.name)).toEqual([`Gongura Chicken ${tag}`]);
      // (No tag here: a shared random suffix would itself look "similar".)
      const biryani = recipeIds[1];
      expect((await similarRecipes('chicken curry', 5)).map((r) => r.id)).not.toContain(biryani);
    });

    it('serves the match from search and maps the typo to it', async () => {
      const term = `gongura chiken ${tag}`;
      const res = await search(term, { take: 20 }, 'card');
      expect(res.source).toBe('cache');
      expect(res.recipes[0].name).toBe(`Gongura Chicken ${tag}`);
      const mapped = await prisma.searchTerm.findUnique({ where: { term } });
      expect(mapped?.recipeId).toBe(res.recipes[0].id);
    });
  });

  describe('recipe quality', () => {
    it('hides an AI recipe two people rejected and nobody kept', async () => {
      const r = await recipe(`Odd Fusion Pizza ${tag}`);
      const [a, b] = [await user(), await user()];
      await prisma.userEvent.createMany({
        data: [a, b].map((u) => ({ userId: u.id, type: 'dislike', recipeId: r.id, weight: -6 })),
      });
      await recomputeRecipeQuality();
      expect((await prisma.recipe.findUniqueOrThrow({ where: { id: r.id } })).qualityScore).toBe(-4);

      const listed = async () => [
        ...(await browse({ take: 50 }, 'card')).recipes.map((x) => x.id),
        ...(await getRandom(50, 'card')).map((x) => x.id),
        ...(await similarRecipes(`odd fusion pizza ${tag}`, 5)).map((x) => x.id),
      ];
      expect(await listed()).not.toContain(r.id);

      // One person keeping it lifts it back to -3: visible again.
      await prisma.favorite.create({ data: { userId: (await user()).id, recipeId: r.id } });
      await recomputeRecipeQuality();
      expect(await listed()).toContain(r.id);
    });

    it('counts each person once', async () => {
      const r = await recipe(`Loved Dal ${tag}`);
      const u = await user();
      await prisma.favorite.create({ data: { userId: u.id, recipeId: r.id } });
      await prisma.mealLog.createMany({
        data: [1, 2, 3].map(() => ({
          userId: u.id, recipeId: r.id, name: 'dal', mealType: 'lunch', calories: 1, protein: 1, carbs: 1, fat: 1,
        })),
      });
      await recomputeRecipeQuality();
      expect((await prisma.recipe.findUniqueOrThrow({ where: { id: r.id } })).qualityScore).toBe(1);
    });
  });

  describe('barcode memory', () => {
    const code = `99${Date.now()}`.slice(0, 13);
    const offProduct = {
      product: { product_name: 'Test Biscuits', nutriments: { 'energy-kcal_100g': 480, proteins_100g: 7 } },
    };
    let fetchMock: ReturnType<typeof vi.fn>;
    const stubFetch = (status: number, body: unknown = {}) => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
      vi.stubGlobal('fetch', fetchMock);
    };
    afterEach(() => vi.unstubAllGlobals());
    afterAll(async () => {
      await prisma.foodProduct.deleteMany({ where: { barcode: code } });
      await prisma.barcodeMiss.deleteMany({ where: { barcode: code } });
    });

    it('remembers a miss instead of asking OFF again', async () => {
      stubFetch(404);
      expect(await lookupBarcode(code)).toBeNull();
      expect(await lookupBarcode(code)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('asks again once the miss is old, and forgets it when found', async () => {
      await prisma.barcodeMiss.update({ where: { barcode: code }, data: { checkedAt: new Date(Date.now() - 8 * 86_400_000) } });
      stubFetch(200, offProduct);
      expect((await lookupBarcode(code))?.name).toBe('Test Biscuits');
      expect(await prisma.barcodeMiss.findUnique({ where: { barcode: code } })).toBeNull();
    });

    it('refreshes stale data and keeps it when OFF dropped the product', async () => {
      stubFetch(200, { product: { ...offProduct.product, product_name: 'New Recipe Biscuits' } });
      await refreshProduct(code);
      expect((await prisma.foodProduct.findUniqueOrThrow({ where: { barcode: code } })).name).toBe('New Recipe Biscuits');

      stubFetch(404);
      await refreshProduct(code);
      const kept = await prisma.foodProduct.findUniqueOrThrow({ where: { barcode: code } });
      expect(kept.name).toBe('New Recipe Biscuits');
      expect(Date.now() - kept.fetchedAt.getTime()).toBeLessThan(60_000);
    });
  });
});
