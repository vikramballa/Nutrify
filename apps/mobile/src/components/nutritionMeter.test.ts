import { describe, expect, it } from 'vitest';
import { progress, remaining } from './nutritionMeter';

describe('progress', () => {
  it('returns the consumed fraction', () => {
    expect(progress(1060, 2120)).toBeCloseTo(0.5);
  });

  it('clamps over-eating to a full ring', () => {
    expect(progress(3000, 2120)).toBe(1);
  });

  it('survives a zero or missing goal', () => {
    expect(progress(500, 0)).toBe(0);
    expect(progress(500, Number.NaN)).toBe(0);
  });
});

describe('remaining', () => {
  it('goes negative past the goal', () => {
    expect(remaining(2400, 2120)).toBe(-280);
  });
});
