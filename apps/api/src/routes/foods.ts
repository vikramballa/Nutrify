import type { FastifyInstance } from 'fastify';
import { BarcodeSchema } from '@nutrichef/shared';
import { FoodLookupUnavailableError, lookupBarcode } from '../services/foodProducts.js';
import { forgetFood, savedFoods, usualGramsFor } from '../services/personalFoods.js';

export async function foodRoutes(app: FastifyInstance) {
  // Labels this user logged before: one tap logs one again, no camera.
  app.get('/foods/mine', async (req) => ({ foods: await savedFoods(req.userId) }));

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
        const product = await lookupBarcode(code.data);
        if (!product) return reply.code(404).send({ error: 'product_not_found' });
        // How much this user had last time, so the amount starts there.
        return { ...product, usualGrams: await usualGramsFor(req.userId, code.data) };
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
