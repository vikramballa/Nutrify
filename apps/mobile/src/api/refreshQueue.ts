/**
 * Single-flight wrapper around a token-refresh call: concurrent callers
 * share the one in-flight promise instead of each firing their own
 * /auth/refresh (which would rotate the refresh token out from under the
 * others). Once the in-flight attempt settles — success or failure — the
 * next caller starts a fresh attempt.
 *
 * Pure module (no RN imports) so it can be unit-tested outside Expo.
 */
export function createRefreshQueue(
  doRefresh: () => Promise<string | null>,
): () => Promise<string | null> {
  let inflight: Promise<string | null> | null = null;
  return () => {
    if (!inflight) {
      inflight = doRefresh().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}
