import { describe, it, expect } from 'vitest';
import { computeMetrics, computeGoals, type ProfileInput } from '../src/index.js';

// 30y male, 175cm, 70kg, moderate activity, maintain.
const p: ProfileInput = {
  name: 'T',
  age: 30,
  heightCm: 175,
  weightKg: 70,
  sex: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
  conditions: [],
};

describe('computeMetrics', () => {
  it('computes BMI, body fat, BMR and TDEE per the reference formulas', () => {
    const m = computeMetrics(p);
    expect(m.bmi).toBe(22.9); // 70 / 1.75^2
    expect(m.bmiCategory).toBe('Normal');
    expect(m.bodyFatPct).toBe(18.1); // Deurenberg: 1.2*22.86 + 0.23*30 - 10.8 - 5.4
    expect(m.bmr).toBe(1649); // Mifflin-St Jeor: 700 + 1093.75 - 150 + 5
    expect(m.tdee).toBe(2556); // 1648.75 * 1.55
  });
});

describe('computeGoals', () => {
  it('maintain goal returns TDEE with balanced macros', () => {
    const g = computeGoals(p);
    expect(g.calories).toBe(2556);
    expect(g.protein).toBe(112); // 1.6 g/kg
    expect(g.fat).toBe(85); // 30% of calories / 9
    expect(g.carbs).toBeGreaterThan(0);
    expect(Math.abs(g.protein * 4 + g.fat * 9 + g.carbs * 4 - g.calories)).toBeLessThan(20);
  });

  it('caps carbs at 40% of calories for diabetes', () => {
    const gd = computeGoals({ ...p, sex: 'female', goal: 'lose_weight', conditions: ['diabetes'] });
    expect(gd.carbs).toBeLessThanOrEqual(Math.round((gd.calories * 0.4) / 4));
  });

  it('never drops below the 1200 kcal floor for a small sedentary woman', () => {
    const tiny: ProfileInput = {
      ...p,
      sex: 'female',
      age: 60,
      heightCm: 150,
      weightKg: 45,
      activityLevel: 'sedentary',
      goal: 'lose_weight',
    };
    expect(computeGoals(tiny).calories).toBe(1200);
  });
});
