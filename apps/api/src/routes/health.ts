import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { activeProviderNames } from '../services/ai/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    const aiProviders = activeProviderNames();
    return { ok: db, db, aiProviders };
  });
}
