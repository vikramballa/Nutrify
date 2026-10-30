import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma.js';
import { activeProviderNames } from './services/ai/index.js';
import { healthRoutes } from './routes/health.js';
import { recipeRoutes } from './routes/recipes.js';
import { groceryRoutes } from './routes/grocery.js';
import { profileRoutes } from './routes/profile.js';
import { chatRoutes } from './routes/chat.js';
import { authRoutes } from './routes/auth.js';
import { logRoutes } from './routes/logs.js';
import { favoriteRoutes } from './routes/favorites.js';
import { mealPlanRoutes } from './routes/mealplan.js';
import { trackingRoutes } from './routes/tracking.js';
import { assistantRoutes } from './routes/assistant.js';
import { foodRoutes } from './routes/foods.js';
import { legalRoutes } from './routes/legal.js';
import { verifyAccessToken } from './lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    /** Has agreed to share data with the AI provider; see lib/aiConsent. */
    aiConsent: boolean;
  }
}

// Everything is small JSON; the two photo routes raise their own limit.
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

// The mobile app is not a browser and needs no CORS. Reflecting every origin
// let any website script this API with a user's token, so browsers are
// allowed only when named (Expo web in dev); production defaults to none.
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
await app.register(helmet);
await app.register(cors, {
  origin: corsOrigins?.length ? corsOrigins : process.env.NODE_ENV !== 'production',
});
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// Public routes need no token; everything else requires a valid Bearer
// access token for a user that still exists. Matched against the routed
// pattern, not the raw URL: a prefix test on req.url also exempted anything
// that merely started with a public path.
const PUBLIC_ROUTES = new Set([
  '/health',
  '/privacy',
  '/terms',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
]);

app.addHook('onRequest', async (req, reply) => {
  if (PUBLIC_ROUTES.has(req.routeOptions.url ?? '')) return;
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) return reply.code(401).send({ error: 'unauthorized' });
  // A token for a deleted user must not authorize anything.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiConsentAt: true },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  req.userId = userId;
  req.aiConsent = user.aiConsentAt != null;
});

// Errors are always JSON: { error: { code, message } }. Known Prisma errors
// map to proper status codes; 5xx messages are never leaked to clients.
const PRISMA_ERROR_MAP: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'conflict', message: 'a record with this value already exists' },
  P2025: { status: 404, code: 'not_found', message: 'record not found' },
  P2003: { status: 400, code: 'bad_request', message: 'invalid reference' },
};

// Fastify's stock 404 body is {message,error,statusCode}, a third shape the
// client cannot read. Route it through the same envelope as everything else.
app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ error: { code: 'not_found', message: 'route not found' } });
});

app.setErrorHandler((err: FastifyError, req, reply) => {
  req.log.error(err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code];
    if (mapped) {
      return reply
        .code(mapped.status)
        .send({ error: { code: mapped.code, message: mapped.message } });
    }
  }
  const status = err.statusCode ?? 500;
  const code = status === 429 ? 'rate_limited' : status < 500 ? 'bad_request' : 'internal_error';
  const message = status < 500 ? err.message || code : 'internal server error';
  reply.code(status).send({ error: { code, message } });
});

await app.register(healthRoutes);
await app.register(legalRoutes);
await app.register(authRoutes, { prefix: '/api/v1' });
await app.register(recipeRoutes, { prefix: '/api/v1' });
await app.register(groceryRoutes, { prefix: '/api/v1' });
await app.register(profileRoutes, { prefix: '/api/v1' });
await app.register(chatRoutes, { prefix: '/api/v1' });
await app.register(logRoutes, { prefix: '/api/v1' });
await app.register(favoriteRoutes, { prefix: '/api/v1' });
await app.register(mealPlanRoutes, { prefix: '/api/v1' });
await app.register(trackingRoutes, { prefix: '/api/v1' });
await app.register(assistantRoutes, { prefix: '/api/v1' });
await app.register(foodRoutes, { prefix: '/api/v1' });

// UserEvent gains a row per suggestion shown and RefreshToken a row per login,
// and neither was ever pruned — both grow without bound. The taste engine only
// looks 90 days back and a refresh token dies at 30 days, so anything older is
// pure storage cost. ponytail: in-process timer, one sweep a day; move to a
// real scheduler if the API ever runs more than one instance.
const RETENTION_SWEEP_MS = 24 * 60 * 60 * 1000;
const EVENT_RETENTION_DAYS = 90;

async function sweepExpiredRows() {
  const eventCutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000);
  try {
    const [events, tokens] = await Promise.all([
      prisma.userEvent.deleteMany({ where: { createdAt: { lt: eventCutoff } } }),
      prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    app.log.info(`retention sweep: ${events.count} events, ${tokens.count} refresh tokens removed`);
  } catch (err) {
    app.log.warn({ err }, 'retention sweep failed');
  }
}

const sweepTimer = setInterval(sweepExpiredRows, RETENTION_SWEEP_MS);
sweepTimer.unref(); // never hold the process open
void sweepExpiredRows();

// Close the pool on shutdown so rolling deploys don't leak DB connections.
app.addHook('onClose', async () => {
  clearInterval(sweepTimer);
  await prisma.$disconnect();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

const port = Number(process.env.PORT ?? 4000);
const chain = activeProviderNames();
app.log.info(`AI provider chain: ${chain.length ? chain.join(' -> ') : '(none configured)'}`);
if (process.env.NODE_ENV === 'production' && !process.env.SUPPORT_EMAIL) {
  app.log.warn('SUPPORT_EMAIL is not set; the privacy policy has no contact address');
}

app
  .listen({ port, host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
