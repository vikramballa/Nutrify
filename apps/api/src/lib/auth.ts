import { randomBytes, scrypt, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const DEV_SECRET = 'dev-only-insecure-secret-change-me';
const SECRET = process.env.AUTH_SECRET || DEV_SECRET;

// Every token in the system is signed with SECRET, so a production boot on the
// dev fallback (or on the placeholder from .env.example) would issue forgeable
// tokens. Fail at import, before a single request can be served.
if (
  process.env.NODE_ENV === 'production' &&
  (SECRET === DEV_SECRET || SECRET === 'change-me-to-a-long-random-string' || SECRET.length < 32)
) {
  throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters in production');
}
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Password hashing (scrypt, stored as "salt:derivedKey" hex) ---

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(keyHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// --- Access tokens (HMAC-signed, self-contained: "payloadB64.signature") ---

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

/** Short-lived access token; `ttlMs` is injectable for tests. */
export function issueAccessToken(userId: string, ttlMs = ACCESS_TOKEN_TTL_MS): string {
  const payload = JSON.stringify({ userId, type: 'access', exp: Date.now() + ttlMs });
  const payloadB64 = b64url(payload);
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Returns the userId if the access token is valid and unexpired, else null. */
export function verifyAccessToken(token: string): string | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { userId, type, exp } = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString(),
    );
    if (typeof userId !== 'string' || typeof exp !== 'number') return null;
    if (type !== 'access') return null; // refresh tokens are not Bearer tokens
    if (Date.now() > exp) return null;
    return userId;
  } catch {
    return null;
  }
}

// --- Refresh tokens (opaque random; only the SHA-256 hash is stored) ---

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
