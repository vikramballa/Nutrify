import { describe, expect, it } from 'vitest';
import { intParam } from '../src/lib/query.js';

describe('intParam', () => {
  it('uses the fallback when the param is missing or junk', () => {
    expect(intParam(undefined, 20, 50)).toBe(20);
    expect(intParam('abc', 20, 50)).toBe(20);
    expect(intParam('0', 20, 50)).toBe(20);
  });

  it('clamps to [1, max]', () => {
    expect(intParam('-5', 20, 50)).toBe(1);
    expect(intParam('999', 20, 50)).toBe(50);
    expect(intParam('7', 20, 50)).toBe(7);
  });
});
