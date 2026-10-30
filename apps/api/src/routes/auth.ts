import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from '../lib/auth.js';

// Upper bounds matter as much as lower ones: scrypt runs over the whole
// password, so an unbounded one is a CPU-exhaustion lever on a public route.
const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// Login stays at min(1) so accounts made under the old 6-character rule
// can still sign in; only new passwords must meet the 8-character floor.
const RegisterSchema = LoginSchema.extend({
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100).optional(),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });

// Brute-force guard on the credential endpoints (global limit is 100/min).
const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

const DeleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

function userDTO(user: {
  id: string;
  email: string;
  name: string;
  onboarded: boolean;
  aiConsentAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    onboarded: user.onboarded,
    aiConsent: user.aiConsentAt != null,
  };
}

/** Issue a fresh access+refresh pair. */
async function issueTokenPair(userId: string) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  const accessToken = issueAccessToken(userId);
  return { accessToken, refreshToken };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_credentials' });
    }
    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: 'email_taken' });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(parsed.data.password),
        name: parsed.data.name ?? email.split('@')[0],
        goals: { create: {} },
      },
    });
    return { ...(await issueTokenPair(user.id)), user: userDTO(user) };
  });

  app.post('/auth/login', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_credentials' });
    }
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Verify even when the user is missing to keep timing uniform.
    const ok = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await verifyPassword(parsed.data.password, 'x:0');
    if (!user || !ok) return reply.code(401).send({ error: 'bad_credentials' });

    return { ...(await issueTokenPair(user.id)), user: userDTO(user) };
  });

  // Swap a valid refresh token for a new pair; the old token is revoked
  // (rotation) so a stolen token can only be used once.
  app.post('/auth/refresh', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_refresh_token' });

    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    const now = new Date();
    // Claim and revoke in one statement. Read-then-update let two concurrent
    // requests both pass the check and each mint a pair from one token.
    const { count } = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (count === 0 || !stored) {
      // A rotated-out token coming back means it was copied: the thief or the
      // user holds a live descendant. Revoke the whole family so neither does.
      if (stored?.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        req.log.warn({ userId: stored.userId }, 'refresh token reuse; all sessions revoked');
      }
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }
    return { ...(await issueTokenPair(stored.userId)), user: userDTO(stored.user) };
  });

  // Revoke a refresh token (idempotent — unknown tokens are fine).
  app.post('/auth/logout', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_refresh_token' });
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(parsed.data.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  });

  // Current user from the Bearer token (req.userId set by the auth hook).
  app.get('/auth/me', async (req) => {
    // The auth hook has just confirmed this user exists.
    return userDTO(await prisma.user.findUniqueOrThrow({ where: { id: req.userId } }));
  });

  // In-app account deletion (App Store 5.1.1(v)). The password is asked for
  // again so a phone left unlocked can't erase someone's history. Every
  // user-owned table cascades from User, so this one delete removes all of it
  // — logs, chat, tokens, events — and the access token dies with the row.
  app.delete('/auth/account', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = DeleteAccountSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'password_required' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    // 403, not 401: the client reads a 401 as an expired session and signs out.
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(403).send({ error: 'wrong_password' });
    }
    await prisma.user.delete({ where: { id: user.id } });
    return { deleted: true };
  });
}
