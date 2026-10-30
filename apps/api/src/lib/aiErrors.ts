import type { FastifyReply } from 'fastify';
import { AllProvidersFailedError, NoVisionProviderError } from '../services/ai/index.js';

/**
 * The one mapping from AI-chain failures to HTTP: 503 for "no model
 * available", 502 for "model answered nonsense". Anything else rethrows to
 * the global error handler.
 */
export function sendAiError(reply: FastifyReply, err: unknown) {
  if (err instanceof AllProvidersFailedError) {
    return reply.code(503).send({ error: 'no_ai_provider' });
  }
  if (err instanceof NoVisionProviderError) {
    return reply.code(503).send({ error: 'no_vision_provider' });
  }
  if ((err as Error).message?.startsWith('ai_bad_shape')) {
    return reply.code(502).send({ error: 'ai_bad_response' });
  }
  throw err;
}
