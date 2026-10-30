import { describe, it, expect } from 'vitest';
import { computeGoals, type ProfileInput, type ProgressDay } from '@nutrichef/shared';
import { computeAdaptiveGoals, weightSlopeKgPerDay, type WeighIn } from '../src/services/adaptive.js';

// 30y male, 175cm, 70kg, moderate → formula TDEE ≈ 2556 kcal.
const profile: ProfileInput = {
  name: 'T',
  age: 30,
  heightCm: 175,
  weightKg: 70,
  sex: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
  conditions: [],
};

function key(offset: number): string {
  const d = new Date(Date.UTC(2026, 8, 1 + offset));
  return d.toISOString().slice(0, 10);
}

/** 28 days, every day logged at `kcal`. */
function days(kcal: number, count = 28): ProgressDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: key(i),
    calories: kcal,
    protein: 100,
    carbs: 200,
    fat: 60,
  }));
}

/** Weekly weigh-ins drifting by `perWeek` kg. */
function weighIns(startKg: number, perWeek: number, weeks = 4): WeighIn[] {
  return Array.from({ length: weeks + 1 }, (_, w) => ({
    date: key(w * 7 > 27 ? 27 : w * 7),
    kg: startKg + perWeek * Math.min(w, 27 / 7),
  }));
}

describe('weightSlopeKgPerDay', () => {
  it('fits a least-squares line', () => {
    const slope = weightSlopeKgPerDay([
      { date: key(0), kg: 80 },
      { date: key(7), kg: 79.3 },
      { date: key(14), kg: 78.6 },
    ]);
    expect(slope).toBeCloseTo(-0.1, 6);
  });

  it('is 0 without two points', () => {
    expect(weightSlopeKgPerDay([{ date: key(0), kg: 80 }])).toBe(0);
  });
});

describe('computeAdaptiveGoals', () => {
  const current = computeGoals(profile); // 2556 kcal maintain

  it('keeps collecting until enough logged days and weigh-ins exist', () => {
    const r = computeAdaptiveGoals({
      profile,
      current,
      days: days(2500, 6),
      weights: [{ date: key(0), kg: 70 }],
    });
    expect(r).toMatchObject({ status: 'collecting', loggedDays: 6, weighIns: 1 });
  });

  it('ignores partially logged days', () => {
    const half = days(current.calories).map((d, i) =>
      i % 2 === 0 ? d : { ...d, calories: 300 },
    );
    const r = computeAdaptiveGoals({ profile, current, days: half, weights: weighIns(70, 0) });
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.loggedDays).toBe(14);
      expect(r.avgIntake).toBe(current.calories);
    }
  });

  it('reads a stable weight as intake == TDEE', () => {
    const r = computeAdaptiveGoals({ profile, current, days: days(2400), weights: weighIns(70, 0) });
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.estimatedTdee).toBe(2400);
      expect(r.suggested.calories).toBe(2400); // maintain → target = measured TDEE
      expect(r.changed).toBe(true);
    }
  });

  it('adds back the energy of weight lost', () => {
    // 2000 kcal/day while losing 0.5 kg/week → TDEE = 2000 + 0.5/7 × 7700 = 2550
    const r = computeAdaptiveGoals({ profile, current, days: days(2000), weights: weighIns(72, -0.5) });
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.weeklyChangeKg).toBeCloseTo(-0.5, 2);
    expect(r.estimatedTdee).toBeCloseTo(2550, -1);
    expect(r.changed).toBe(false); // matches the formula — nothing to change
  });

  it('moves the target at most 300 kcal per recalibration', () => {
    const lose: ProfileInput = { ...profile, goal: 'lose_weight' };
    const cur = computeGoals(lose); // ~2056
    // Gaining 0.5 kg/week at 2600 → TDEE clamps near 2050, ideal ≈ 1550
    const r = computeAdaptiveGoals({ profile: lose, current: cur, days: days(2600), weights: weighIns(70, 0.5) });
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.suggested.calories).toBe(cur.calories - 300);
  });

  it('clamps a wild measurement to ±25% of the formula', () => {
    const r = computeAdaptiveGoals({ profile, current, days: days(1400), weights: weighIns(70, 1) });
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.estimatedTdee).toBe(Math.round(r.formulaTdee * 0.75));
  });

  it('follows the latest weigh-in for protein', () => {
    const r = computeAdaptiveGoals({ profile, current, days: days(2556), weights: weighIns(80, 0) });
    if (r.status !== 'ready') throw new Error('expected ready');
    expect(r.suggested.protein).toBe(Math.round(80 * 1.6));
  });
});
