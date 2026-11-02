import { prisma } from './prisma.js';
import { TtlCache } from './ttlCache.js';

/**
 * What the auth hook needs on every request: that the user still exists, and
 * whether they agreed to AI processing. It was a database read per request;
 * cached briefly, a burst of calls from one screen costs one read.
 *
 * The two writes that change the answer (account deletion, consent change)
 * call forgetAuthUser, so on a single instance they take effect at once. The
 * short TTL bounds staleness for anything else (e.g. a row deleted by hand).
 */
const AUTH_TTL_MS = 30_000;
const cache = new TtlCache<string, { aiConsent: boolean } | null>(AUTH_TTL_MS, 20_000);

/** The user's auth state, or null when the user no longer exists. */
export async function loadAuthUser(userId: string): Promise<{ aiConsent: boolean } | null> {
  return cache.getOrLoad(userId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiConsentAt: true } });
    return user ? { aiConsent: user.aiConsentAt != null } : null;
  });
}

/** Call after deleting a user or changing their AI consent. */
export function forgetAuthUser(userId: string): void {
  cache.delete(userId);
}
