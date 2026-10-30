import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { createRefreshQueue } from './refreshQueue';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// The API serves the policy pages at its root, outside /api/v1.
const SITE = BASE.replace(/\/api\/v1\/?$/, '');
export const PRIVACY_URL = `${SITE}/privacy`;
export const TERMS_URL = `${SITE}/terms`;

/**
 * Validate an API response against a shared zod schema. Fail-safe: on
 * mismatch we log a warning in dev builds and pass the raw data through,
 * so a server change degrades loudly in development but never breaks prod.
 * Schemas strip unknown keys by default, so server-side extra fields are fine.
 */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  label: string,
): z.infer<S> {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  if (__DEV__) {
    console.warn(`[api] ${label} failed schema validation`, res.error.issues);
  }
  return data as z.infer<S>;
}

export interface ApiError extends Error {
  status?: number;
}

// Access token: memory cache + AsyncStorage (short-lived, 15 min).
// Refresh token: SecureStore only (long-lived credential).
const TOKEN_KEY = 'authToken';
const REFRESH_KEY = 'refreshToken';
let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null; // SecureStore unavailable (e.g. web) — treat as logged out
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    // best effort
  }
}

/** AuthContext registers a handler here; fired when a session refresh fails. */
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(handler: (() => void) | null): void {
  onAuthExpired = handler;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * POST /auth/refresh; returns the new access token, or null when the server
 * rejected the refresh token (the session is over). A network failure or 5xx
 * throws instead: returning null for those logged the user out whenever the
 * connection dropped at the moment the 15-minute access token renewed.
 */
async function performRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetchWithTimeout(
    `${BASE}/auth/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    },
    TIMEOUT_MS,
  );
  if (res.status === 400 || res.status === 401) return null; // reuse/expired/revoked
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as Partial<RefreshResponse>;
  if (!data.accessToken || !data.refreshToken) return null;
  await setToken(data.accessToken);
  await setRefreshToken(data.refreshToken); // rotation: store the new pair
  return data.accessToken;
}

// Concurrent 401s share one refresh attempt (rotation makes a second
// parallel refresh fail as "reuse").
const requestRefresh = createRefreshQueue(performRefresh);

// Credential endpoints: a 401 here means bad credentials, not a stale token —
// never trigger a refresh for them.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/** Build an ApiError from a non-2xx response, surfacing the server's message. */
async function toApiError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error: unknown }).error;
      // Server shape is {error:{code,message}}; some routes send {error:'...'}.
      if (typeof error === 'string' && error) {
        message = error;
      } else if (
        error &&
        typeof error === 'object' &&
        typeof (error as { message?: unknown }).message === 'string' &&
        (error as { message: string }).message
      ) {
        message = (error as { message: string }).message;
      }
    }
  } catch {
    // non-JSON body — keep the HTTP status message
  }
  const err: ApiError = new Error(message);
  err.status = res.status;
  return err;
}

/**
 * fetch has no timeout of its own: with the server unreachable (Mac asleep,
 * phone off its Wi-Fi) each request sat on the OS connect timeout, ~60-75 s,
 * and react-query retried it three times. Routes that can end in a model call
 * legitimately take longer, so they get a wider budget.
 */
const TIMEOUT_MS = 20_000;
const AI_TIMEOUT_MS = 120_000;
const AI_PATH = /^\/(vision|pantry|coach|chat|recipes\/search|recipes\/[^/]+\/insights)/;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // Keep the caller's own cancellation (react-query aborts superseded searches).
  const outer = init.signal;
  const onAbort = () => ctrl.abort();
  if (outer?.aborted) ctrl.abort();
  else outer?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted && !outer?.aborted) {
      throw Object.assign(new Error("Can't reach NutriChef right now. Check your connection."), {
        status: 0,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const token = await getToken();
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: {
      // Only send a JSON content type when there is a body — Fastify rejects
      // bodyless requests (e.g. DELETE) that carry Content-Type: application/json.
      ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  }, AI_PATH.test(path) ? AI_TIMEOUT_MS : TIMEOUT_MS);

  if (
    res.status === 401 &&
    allowRefresh &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p))
  ) {
    const newToken = await requestRefresh();
    if (newToken) {
      return apiFetch<T>(path, init, false); // retry once with the new token
    }
    // Refresh impossible or rejected: the session is over.
    await clearToken();
    await clearRefreshToken();
    onAuthExpired?.();
  }

  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}
