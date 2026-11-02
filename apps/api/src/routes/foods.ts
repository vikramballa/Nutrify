import type { FastifyInstance } from 'fastify';
import { BarcodeSchema } from '@nutrichef/shared';
import { FoodLookupUnavailableError } from '../services/foodProducts.js';
import { forgetDish, forgetFood, productForUser, savedFoods } from '../services/personalFoods.js';

export async function foodRoutes(app: FastifyInstance) {
  // Labels this user logged before: one tap logs one again, no camera.
  app.get('/foods/mine', async (req) => ({ foods: await savedFoods(req.userId) }));

  // "Forget my usual" for a scanned dish: the scanner stops offering it.
  app.delete<{ Querystring: { name?: string } }>('/foods/dishes', async (req, reply) => {
    const name = (req.query.name ?? '').trim();
    if (!name || name.length > 200) return reply.code(400).send({ error: 'name_required' });
    if (!(await forgetDish(req.userId, name))) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/foods/mine/:id', async (req, reply) => {
    if (!(await forgetFood(req.userId, req.params.id))) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // Open Food Facts allows ~100 product reads/min per client; the cache means
  // only first-time scans reach it, and this keeps one user from spending it.
  app.get<{ Params: { code: string } }>(
    '/foods/barcode/:code',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const code = BarcodeSchema.safeParse(req.params.code);
      if (!code.success) return reply.code(400).send({ error: 'invalid_barcode' });
      try {
        // OFF's product, or the label this user scanned for the barcode,
        // with how much they had last time so the amount starts there.
        const product = await productForUser(req.userId, code.data);
        if (!product) return reply.code(404).send({ error: 'product_not_found' });
        return product;
      } catch (err) {
        if (err instanceof FoodLookupUnavailableError) {
          req.log.warn({ err: err.message }, 'Open Food Facts unavailable');
          return reply.code(503).send({ error: 'lookup_unavailable' });
        }
        throw err;
      }
    },
  );
}
