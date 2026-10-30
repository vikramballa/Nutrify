import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * preHandler for routes that send personal data — meal photos, the health
 * profile, chat — to the third-party AI provider. App Store 5.1.2(i) requires
 * explicit permission first, and checking here rather than only in the app
 * means an old client or a revoked consent can't slip past it.
 */
export async function requireAiConsent(req: FastifyRequest, reply: FastifyReply) {
  if (!req.aiConsent) return reply.code(403).send({ error: 'ai_consent_required' });
}
