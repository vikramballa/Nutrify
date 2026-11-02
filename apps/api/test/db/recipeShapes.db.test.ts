/** Recipe list shapes against a real Postgres. Opt-in: see logQueries.db.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RecipeSchema } from '@nutrichef/shared';
import { prisma } from '../../src/lib/prisma.js';
import { findRecipes, recipesByIds, search } from '../../src/services/recipeService.js';

const RUN = process.env.DB_TESTS === '1';

describe.skipIf(!RUN)('recipe shapes (Postgres)', () => {
  const tag = `dbtest${randomUUID().slice(0, 8)}`;
  const ids: string[] = [];

  beforeAll(async () => {
    for (const n of [1, 2, 3]) {
      const r = await prisma.recipe.create({
        data: {
          name: `${tag} dish ${n}`,
          nameLower: `${tag} dish ${n}`,
          category: 'Main',
          cuisine: 'Indian',
          instructions: 'Step one. '.repeat(150),
          source: 'AI',
          calories: 300 + n,
          ingredients: {
            // Inserted out of order: the full shape must sort by position.
            create: [
              { name: 'salt', measure: '1 tsp', position: 2 },
              { name: 'rice', measure: '1 cup', position: 0 },
              { name: 'dal', measure: '1/2 cup', position: 1 },
            ],
          },
        },
      });
      ids.push(r.id);
    }
  });

  afterAll(async () => {
    await prisma.recipe.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('full recipes carry ingredients in order and instructions', async () => {
    const [r] = await findRecipes({ where: { id: ids[0] } }, 'full');
    expect(r.ingredients.map((i) => i.name)).toEqual(['rice', 'dal', 'salt']);
    expect(r.instructions.length).toBeGreaterThan(1000);
    expect(r.partial).toBeUndefined();
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it('cards drop ingredients and instructions but still pass the app schema', async () => {
    const [r] = await findRecipes({ where: { id: ids[0] } }, 'card');
    expect(r).toMatchObject({ id: ids[0], calories: 301, ingredients: [], instructions: '', partial: true });
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it('cards are much smaller on the wire', async () => {
    const full = JSON.stringify(await recipesByIds(ids, 'full')).length;
    const card = JSON.stringify(await recipesByIds(ids, 'card')).length;
    expect(card).toBeLessThan(full / 3);
  });

  it('recipesByIds keeps the order asked for', async () => {
    const order = [ids[2], ids[0], ids[1]];
    expect((await recipesByIds(order, 'card')).map((r) => r.id)).toEqual(order);
  });

  it('search returns cards from the cache without calling out', async () => {
    const res = await search(tag, { take: 20 }, 'card');
    expect(res.source).toBe('cache');
    expect(res.recipes).toHaveLength(3);
    expect(res.recipes.every((r) => r.partial)).toBe(true);
  });
});
