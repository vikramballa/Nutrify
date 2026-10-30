import type { FastifyInstance } from 'fastify';
import { BarcodeSchema } from '@nutrichef/shared';
import { FoodLookupUnavailableError, lookupBarcode } from '../services/foodProducts.js';

export async function foodRoutes(app: FastifyInstance) {
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
