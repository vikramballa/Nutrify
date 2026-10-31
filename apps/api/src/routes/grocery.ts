import type { FastifyInstance } from 'fastify';
import { GroceryFromRecipeRequestSchema } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { logEvent } from '../services/taste.js';
import { missingIngredientNames } from '../services/mealplan.js';

export function groceryDTO(i: {
  id: string;
  name: string;
  checked: boolean;
  recipeId: string | null;
  recipeName: string | null;
  quantity: string | null;
}) {
  return {
    id: i.id,
    name: i.name,
    checked: i.checked,
    recipeId: i.recipeId,
    recipeName: i.recipeName,
    quantity: i.quantity,
  };
}

export async function groceryRoutes(app: FastifyInstance) {
  app.get('/grocery', async (req) => {
    const items = await prisma.groceryItem.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return items.map(groceryDTO);
  });

  app.post<{ Body: { name?: string } }>('/grocery', async (req, reply) => {
    const name = (req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'name_required' });
    if (name.length > 200) return reply.code(400).send({ error: 'name_too_long' });
    logEvent(req.userId, 'grocery', { term: name }); // strongest taste signal
    const item = await prisma.groceryItem.create({
      data: { name, userId: req.userId },
    });
    return groceryDTO(item);
  });

  // Adds a recipe's ingredients in one call — all of them, or just the ones the
  // user marked as missing (`names`). Each item is tagged with the recipe so
  // the list can group by it and carries the recipe's quantity, read from the
  // stored recipe rather than trusted from the client. Names already on the
  // list (case-insensitive) are skipped so re-tapping "Shop" doesn't duplicate.
  app.post('/grocery/from-recipe', async (req, reply) => {
    const parsed = GroceryFromRecipeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const hasId = typeof (req.body as { recipeId?: unknown } | null)?.recipeId === 'string';
      return reply.code(400).send({ error: hasId ? 'invalid_names' : 'recipe_id_required' });
    }
    const { recipeId, names } = parsed.data;
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { name: true, ingredients: { select: { name: true, measure: true }, orderBy: { position: 'asc' } } },
    });
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });

    const wanted = names && new Set(names.map((n) => n.trim().toLowerCase()));
    const chosen = recipe.ingredients.filter((i) => !wanted || wanted.has(i.name.trim().toLowerCase()));
    const measureOf = new Map(chosen.map((i) => [i.name.trim().toLowerCase(), i.measure.trim()]));
    const existing = await prisma.groceryItem.findMany({
      where: { userId: req.userId },
      select: { name: true },
      take: 500,
    });
    const missing = missingIngredientNames(
      existing.map((i) => i.name),
      chosen.map((i) => i.name),
    );
    if (missing.length > 0) {
      for (const name of missing) logEvent(req.userId, 'grocery', { term: name });
      await prisma.groceryItem.createMany({
        data: missing.map((name) => ({
          userId: req.userId,
          name,
          recipeId,
          recipeName: recipe.name,
          quantity: measureOf.get(name.toLowerCase())?.slice(0, 100) || null,
        })),
      });
    }
    const added = await prisma.groceryItem.findMany({
      where: { userId: req.userId, recipeId, name: { in: missing } },
      orderBy: { createdAt: 'asc' },
    });
    return { added: added.map(groceryDTO), skipped: chosen.length - missing.length };
  });

  app.patch<{ Params: { id: string }; Body: { checked?: boolean } }>(
    '/grocery/:id',
    async (req, reply) => {
      const { count } = await prisma.groceryItem.updateMany({
        where: { id: req.params.id, userId: req.userId },
        data: { checked: Boolean(req.body?.checked) },
      });
      if (count === 0) return reply.code(404).send({ error: 'not_found' });
      const item = await prisma.groceryItem.findUnique({ where: { id: req.params.id } });
      return groceryDTO(item!);
    },
  );

  app.delete<{ Params: { id: string } }>('/grocery/:id', async (req, reply) => {
    const { count } = await prisma.groceryItem.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    if (count === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
