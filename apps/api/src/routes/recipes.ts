import type { FastifyInstance } from 'fastify';
import { sendAiError } from '../lib/aiErrors.js';
import { intParam } from '../lib/query.js';
import * as recipes from '../services/recipeService.js';
import * as taste from '../services/taste.js';
import { getOrComputeNutrition } from '../services/nutritionData.js';
import { prisma } from '../lib/prisma.js';

// A search miss falls through to AI generation, and the result is stored in
// the shared library, so the term is kept dish-sized: 2000 characters was room
// for a prompt injection that every other user would then be served.
const MAX_QUERY_LEN = 100;
// Cuisine names are TheMealDB areas or AI labels ("Saudi Arabian",
// "Asian-inspired"). Each new one costs a full upstream sync and a slot in a
// per-process set, so nothing else gets through.
const CUISINE_RE = /^[A-Za-z][A-Za-z -]{0,39}$/;
// Search and insights can end in a model call; keep one user from spending
// the free-tier quota for everyone.
const AI_RATE_LIMIT = { rateLimit: { max: 30, timeWindow: '1 minute' } };

function parsePage(q: { take?: string; cursor?: string }): { take: number; cursor?: string } {
  return { take: intParam(q.take, 20, 50), cursor: q.cursor };
}

export async function recipeRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; take?: string; cursor?: string } }>(
    '/recipes/search',
    { config: AI_RATE_LIMIT },
    async (req, reply) => {
      const q = req.query.q ?? '';
      if (q.length > MAX_QUERY_LEN) return reply.code(400).send({ error: 'query_too_long' });
      if (q.trim()) taste.logEvent(req.userId, 'search', { term: q });
      return recipes.search(q, parsePage(req.query));
    },
  );

  app.get<{ Querystring: { count?: string } }>('/recipes/random', async (req) => {
    const count = intParam(req.query.count, 5, 10);
    return { recipes: await recipes.getRandom(count) };
  });

  // The full library for the Recipes tab grid (search needs a term).
  app.get<{ Querystring: { take?: string; cursor?: string } }>('/recipes/browse', async (req) =>
    recipes.browse(parsePage(req.query)),
  );

  // Cuisines available for the browse chips (TheMealDB areas + DB).
  app.get('/recipes/cuisines', async () => ({ cuisines: await recipes.listCuisines() }));

  // Full recipe list for one cuisine; syncs from TheMealDB into the DB.
  app.get<{ Querystring: { cuisine?: string; take?: string; cursor?: string } }>(
    '/recipes/by-cuisine',
    async (req, reply) => {
      const cuisine = (req.query.cuisine ?? '').trim();
      if (!cuisine) return reply.code(400).send({ error: 'cuisine_required' });
      if (!CUISINE_RE.test(cuisine)) return reply.code(400).send({ error: 'invalid_cuisine' });
      taste.logEvent(req.userId, 'search', { term: cuisine.toLowerCase() });
      return { recipes: await recipes.getByCuisine(cuisine, parsePage(req.query)) };
    },
  );

  // Personalized suggestions learned from the user's behavior (no LLM).
  app.get<{ Querystring: { count?: string } }>('/recipes/recommended', async (req) => {
    const count = intParam(req.query.count, 5, 10);
    const rec = await taste.recommend(req.userId, count);
    // Empty DB (fresh install) — fall back to the random pipeline, which
    // also pulls from TheMealDB.
    if (rec.recipes.length === 0) {
      return { recipes: await recipes.getRandom(count), personalized: false, reasons: {} };
    }
    return rec;
  });

  /** "Not for me" — the only way the taste engine learns a negative. */
  app.post<{ Params: { id: string } }>('/recipes/:id/dislike', async (req, reply) => {
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });
    taste.logEvent(req.userId, 'dislike', { recipeId: recipe.id });
    return { disliked: true };
  });

  // Developer X-ray into the recommendation brain. Not shipped: it exposes
  // internals no user needs, and App Review flags debug surfaces.
  if (process.env.NODE_ENV !== 'production') {
    app.get('/debug/taste', async (req) => taste.explain(req.userId));
  }

  // Real per-serving nutrition, computed from ingredients (USDA-backed) on
  // first request and cached on the recipe.
  app.get<{ Params: { id: string } }>('/recipes/:id/nutrition', async (req, reply) => {
    const macros = await getOrComputeNutrition(req.params.id);
    if (!macros) return reply.code(404).send({ error: 'nutrition_unavailable' });
    return { ...macros, perServing: true };
  });

  app.get<{ Params: { id: string } }>('/recipes/:id', async (req, reply) => {
    const recipe = await recipes.getById(req.params.id);
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });
    return recipe;
  });

  app.post<{ Params: { id: string } }>(
    '/recipes/:id/insights',
    { config: AI_RATE_LIMIT },
    async (req, reply) => {
      try {
        const insights = await recipes.getOrCreateInsights(req.params.id);
        // The app requests insights when a recipe detail is opened — that's a
        // "view" taste signal, logged only once the recipe is known to exist.
        taste.logEvent(req.userId, 'view', { recipeId: req.params.id });
        return insights;
      } catch (err) {
        if ((err as Error).message === 'recipe_not_found') {
          return reply.code(404).send({ error: 'recipe_not_found' });
        }
        return sendAiError(reply, err);
      }
    },
  );
}
