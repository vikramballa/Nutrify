import type { FastifyInstance } from 'fastify';
import type { ChatMessage } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { aiComplete } from '../services/ai/index.js';
import { sendAiError } from '../lib/aiErrors.js';
import { requireAiConsent } from '../lib/aiConsent.js';
import { CHAT_SYSTEM, profileContext, withHistory } from '../services/ai/prompts.js';
import { logEvent } from '../services/taste.js';

/** Turns fed back to the model as context. Keeps prompts bounded. */
const HISTORY_TURNS = 8;
/** Newest turns the thread view returns; older ones stay stored. */
const THREAD_LIMIT = 500;

const toDTO = (m: ChatMessage) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

/** Same limits for a new message and an edited one. */
function invalidReason(message: string): 'empty_message' | 'message_too_long' | null {
  if (!message) return 'empty_message';
  if (message.length > 2000) return 'message_too_long';
  return null;
}

/**
 * Generate an answer for `message`, using the thread as context. `beforeSeq`
 * scopes the context to earlier turns, which is what an edit needs — the
 * edited turn replaces everything that followed it.
 */
async function answer(userId: string, message: string, beforeSeq?: number) {
  const [user, recent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { goals: true } }),
    prisma.chatMessage.findMany({
      where: { userId, ...(beforeSeq !== undefined ? { seq: { lt: beforeSeq } } : {}) },
      orderBy: { seq: 'desc' },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    }),
  ]);
  const { content, provider } = await aiComplete({
    system: CHAT_SYSTEM + profileContext(user),
    user: withHistory(recent.reverse(), message),
  });
  return { content: content.trim(), provider };
}

export async function chatRoutes(app: FastifyInstance) {
  // The thread, oldest first — capped at the newest THREAD_LIMIT turns.
  app.get('/chat', async (req) => {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { seq: 'desc' },
      take: THREAD_LIMIT,
    });
    return { messages: messages.reverse().map(toDTO) };
  });

  app.post<{ Body: { message?: string } }>(
    '/chat',
    { preHandler: requireAiConsent, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const message = (req.body?.message ?? '').trim();
      const bad = invalidReason(message);
      if (bad) return reply.code(400).send({ error: bad });
      // Food words in chat count toward taste (non-food tokens are filtered
      // against the recipe vocabulary when the profile is built).
      logEvent(req.userId, 'chat', { term: message });
      try {
        // Generate first: the prompt should see the thread without this turn.
        const { content, provider } = await answer(req.userId, message);
        const [saved, savedReply] = await prisma.$transaction([
          prisma.chatMessage.create({
            data: { userId: req.userId, role: 'user', content: message },
          }),
          prisma.chatMessage.create({
            data: { userId: req.userId, role: 'assistant', content },
          }),
        ]);
        return { message: toDTO(saved), reply: toDTO(savedReply), provider };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );

  // Edit a question and re-answer it. Everything after the edited turn is
  // dropped, because those replies answered a question that has changed.
  app.patch<{ Params: { id: string }; Body: { message?: string } }>(
    '/chat/:id',
    { preHandler: requireAiConsent, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const message = (req.body?.message ?? '').trim();
      const bad = invalidReason(message);
      if (bad) return reply.code(400).send({ error: bad });

      const existing = await prisma.chatMessage.findFirst({
        where: { id: req.params.id, userId: req.userId, role: 'user' },
      });
      if (!existing) return reply.code(404).send({ error: 'message_not_found' });

      try {
        const { content, provider } = await answer(req.userId, message, existing.seq);
        const [, saved, savedReply] = await prisma.$transaction([
          prisma.chatMessage.deleteMany({
            where: { userId: req.userId, seq: { gt: existing.seq } },
          }),
          prisma.chatMessage.update({ where: { id: existing.id }, data: { content: message } }),
          prisma.chatMessage.create({
            data: { userId: req.userId, role: 'assistant', content },
          }),
        ]);
        return { message: toDTO(saved), reply: toDTO(savedReply), provider };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );

  // Delete one turn. Removing a question also removes its answer, which would
  // otherwise be left replying to nothing.
  app.delete<{ Params: { id: string } }>('/chat/:id', async (req, reply) => {
    const existing = await prisma.chatMessage.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'message_not_found' });

    const ids = [existing.id];
    if (existing.role === 'user') {
      const answerRow = await prisma.chatMessage.findFirst({
        where: { userId: req.userId, role: 'assistant', seq: { gt: existing.seq } },
        orderBy: { seq: 'asc' },
      });
      if (answerRow) ids.push(answerRow.id);
    }
    const { count } = await prisma.chatMessage.deleteMany({ where: { id: { in: ids } } });
    return { deleted: count };
  });

  // Clear the whole thread.
  app.delete('/chat', async (req) => {
    const { count } = await prisma.chatMessage.deleteMany({ where: { userId: req.userId } });
    return { deleted: count };
  });
}
