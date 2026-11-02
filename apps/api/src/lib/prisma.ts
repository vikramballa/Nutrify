import { PrismaClient } from '@prisma/client';

/**
 * Queries slower than this (ms) are logged as warnings, so a regression shows
 * up in the API's own logs before users feel it. SLOW_QUERY_MS=0 turns it off.
 * Only the SQL text is logged, never its parameters (they hold user data).
 */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);

export const prisma = new PrismaClient(
  SLOW_QUERY_MS > 0 ? { log: [{ emit: 'event', level: 'query' }] } : undefined,
);

if (SLOW_QUERY_MS > 0) {
  // `$on` is typed only when the log option is a literal; this keeps the
  // client one shared instance either way.
  (prisma as unknown as PrismaClient<{ log: [{ emit: 'event'; level: 'query' }] }>).$on('query', (e) => {
    if (e.duration >= SLOW_QUERY_MS) {
      console.warn(`[db] slow query ${e.duration} ms: ${e.query.slice(0, 500)}`);
    }
  });
}
