import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { toDTO } from '../services/recipeService.js';
import { logEvent } from '../services/taste.js';

export async function favoriteRoutes(app: FastifyInstance) {
  app.get('/favorites', async (req) => {
    const favs = await prisma.favorite.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { recipe: { include: { ingredients: true } } },
      take: 200,
    });
    return { recipes: favs.map((f) => toDTO(f.recipe)) };
  });

  // Toggle: saved → unsaved → saved.
  app.post<{ Params: { recipeId: string } }>('/favorites/:recipeId', async (req, reply) => {
    const { recipeId } = req.params;
    const existing = await prisma.favorite.findUnique({
      where: { userId_recipeId: { userId: req.userId, recipeId } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });
    await prisma.favorite.create({ data: { userId: req.userId, recipeId } });
    logEvent(req.userId, 'favorite', { recipeId }); // saving = strong taste signal
    return { favorited: true };
  });
}
