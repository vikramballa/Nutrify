import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { logEvent } from '../services/taste.js';
import { missingIngredientNames } from '../services/mealplan.js';

export function groceryDTO(i: {
  id: string;
  name: string;
  checked: boolean;
  recipeId: string | null;
  recipeName: string | null;
}) {
  return { id: i.id, name: i.name, checked: i.checked, recipeId: i.recipeId, recipeName: i.recipeName };
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

  // Adds every ingredient of one recipe in a single call, tagging each item
  // with the recipe so the list can group by it, and skipping names already
  // on the list (case-insensitive) so re-tapping "Shop" doesn't duplicate.
  app.post<{ Body: { recipeId?: string } }>('/grocery/from-recipe', async (req, reply) => {
    const recipeId = (req.body?.recipeId ?? '').trim();
    if (!recipeId) return reply.code(400).send({ error: 'recipe_id_required' });
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { name: true, ingredients: { select: { name: true } } },
    });
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });

    const needed = recipe.ingredients.map((i) => i.name);
    const existing = await prisma.groceryItem.findMany({
      where: { userId: req.userId },
      select: { name: true },
      take: 500,
    });
    const missing = missingIngredientNames(existing.map((i) => i.name), needed);
    if (missing.length > 0) {
      for (const name of missing) logEvent(req.userId, 'grocery', { term: name });
      await prisma.groceryItem.createMany({
        data: missing.map((name) => ({ userId: req.userId, name, recipeId, recipeName: recipe.name })),
      });
    }
    const added = await prisma.groceryItem.findMany({
      where: { userId: req.userId, recipeId, name: { in: missing } },
      orderBy: { createdAt: 'asc' },
    });
    return { added: added.map(groceryDTO), skipped: needed.length - missing.length };
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
