import { describe, it, expect } from 'vitest';
import { learnReminders } from './schedule';

describe('learnReminders', () => {
  it('falls back to sensible defaults with no history', () => {
    const [breakfast, lunch, dinner] = learnReminders([]);
    expect(breakfast).toEqual({ mealType: 'breakfast', hour: 7, minute: 45 });
    expect(lunch).toEqual({ mealType: 'lunch', hour: 12, minute: 45 });
    expect(dinner).toEqual({ mealType: 'dinner', hour: 19, minute: 45 });
  });

  it('ignores history below the sample threshold', () => {
    const [breakfast] = learnReminders([
      { mealType: 'breakfast', hour: 11 },
      { mealType: 'breakfast', hour: 11 },
    ]);
    expect(breakfast.hour).toBe(7); // still the default
  });

  it('learns the median time once there is enough history', () => {
    const [breakfast] = learnReminders([
      { mealType: 'breakfast', hour: 10 },
      { mealType: 'breakfast', hour: 10.5 },
      { mealType: 'breakfast', hour: 11 },
    ]);
    // median 10.5 → 10:30, minus the 15 minute lead
    expect(breakfast).toEqual({ mealType: 'breakfast', hour: 10, minute: 15 });
  });

  it('is not dragged around by a single outlier', () => {
    const [, lunch] = learnReminders([
      { mealType: 'lunch', hour: 13 },
      { mealType: 'lunch', hour: 13 },
      { mealType: 'lunch', hour: 13 },
      { mealType: 'lunch', hour: 3 }, // one very late night
    ]);
    expect(lunch.hour).toBe(12);
    expect(lunch.minute).toBe(45);
  });

  it('never wraps past midnight into the previous day', () => {
    const [breakfast] = learnReminders([
      { mealType: 'breakfast', hour: 0.1 },
      { mealType: 'breakfast', hour: 0.1 },
      { mealType: 'breakfast', hour: 0.1 },
    ]);
    expect(breakfast).toEqual({ mealType: 'breakfast', hour: 0, minute: 0 });
  });

  it('keeps meals separate', () => {
    const reminders = learnReminders([
      { mealType: 'dinner', hour: 22 },
      { mealType: 'dinner', hour: 22 },
      { mealType: 'dinner', hour: 22 },
    ]);
    expect(reminders.map((r) => r.mealType)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(reminders[2].hour).toBe(21);
    expect(reminders[0].hour).toBe(7); // untouched by dinner history
  });
});
