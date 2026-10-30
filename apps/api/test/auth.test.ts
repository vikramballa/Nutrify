import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../src/lib/auth.js';

describe('password hashing', () => {
  it('roundtrips: verify accepts the right password', async () => {
    const stored = await hashPassword('hunter2');
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword('hunter2', stored)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('hunter2');
    expect(await verifyPassword('hunter3', stored)).toBe(false);
  });

  it('uses a random salt (same password → different hashes)', async () => {
    expect(await hashPassword('pw')).not.toBe(await hashPassword('pw'));
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('pw', 'garbage')).toBe(false);
    expect(await verifyPassword('pw', '')).toBe(false);
    expect(await verifyPassword('pw', 'x:0')).toBe(false);
  });
});

describe('access tokens', () => {
  it('sign + verify roundtrip', () => {
    const token = issueAccessToken('user-1');
    expect(verifyAccessToken(token)).toBe('user-1');
  });

  it('rejects a tampered payload', () => {
    const token = issueAccessToken('user-1');
    const [payloadB64, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ userId: 'user-2', type: 'access', exp: Date.now() + 1e6 })).toString('base64url')}.${sig}`;
    expect(verifyAccessToken(forged)).toBe(null);
    expect(verifyAccessToken(`${payloadB64}.deadbeef`)).toBe(null);
  });

  it('rejects expired tokens', () => {
    const token = issueAccessToken('user-1', -1000); // expired 1s ago
    expect(verifyAccessToken(token)).toBe(null);
  });

  it('rejects tokens without the access type claim', () => {
    const payloadB64 = Buffer.from(
      JSON.stringify({ userId: 'user-1', exp: Date.now() + 1e6 }),
    ).toString('base64url');
    expect(verifyAccessToken(`${payloadB64}.whatever`)).toBe(null);
  });

  it('rejects garbage input', () => {
    expect(verifyAccessToken('')).toBe(null);
    expect(verifyAccessToken('not-a-token')).toBe(null);
    expect(verifyAccessToken('!!!.!!!')).toBe(null);
  });
});

describe('refresh tokens', () => {
  it('generates unique opaque tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
  });

  it('hashes deterministically (and the hash hides the token)', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
