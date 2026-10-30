import { describe, it, expect } from 'vitest';
import {
  parseDay,
  dayKey,
  weekStart,
  weekBounds,
  computeDayTotals,
  missingIngredientNames,
} from '../src/services/mealplan.js';

describe('parseDay', () => {
  it('parses a valid key to UTC midnight', () => {
    expect(parseDay('2026-07-15')?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rejects malformed or overflowing dates', () => {
    expect(parseDay('2026-02-31')).toBeNull();
    expect(parseDay('07/15/2026')).toBeNull();
    expect(parseDay('')).toBeNull();
  });
});

describe('weekStart', () => {
  it('normalizes any day of the week to Monday', () => {
    // 2026-07-19 is a Sunday; its week starts Monday 2026-07-13.
    expect(dayKey(weekStart(parseDay('2026-07-19')!))).toBe('2026-07-13');
    expect(dayKey(weekStart(parseDay('2026-07-13')!))).toBe('2026-07-13');
    expect(dayKey(weekStart(parseDay('2026-07-15')!))).toBe('2026-07-13');
  });

  it('crosses month boundaries', () => {
    // 2026-08-01 is a Saturday; Monday is 2026-07-27.
    expect(dayKey(weekStart(parseDay('2026-08-01')!))).toBe('2026-07-27');
  });
});

describe('weekBounds', () => {
  it('returns 7 consecutive day keys Monday..Sunday', () => {
    const b = weekBounds('2026-07-19')!;
    expect(b.days).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    expect(dayKey(b.endExclusive)).toBe('2026-07-20');
  });

  it('rejects a malformed week param', () => {
    expect(weekBounds('next week')).toBeNull();
  });
});

describe('computeDayTotals', () => {
  const days = ['2026-07-13', '2026-07-14'];

  it('multiplies recipe nutrition by servings; custom entries count 0', () => {
    const totals = computeDayTotals(days, [
      {
        date: '2026-07-13',
        servings: 2,
        recipe: { calories: 300, protein: 20, carbs: 30, fat: 10 },
      },
      { date: '2026-07-13', servings: 1, recipe: null }, // custom entry
      {
        date: '2026-07-14',
        servings: 1,
        recipe: { calories: null, protein: null, carbs: null, fat: null }, // no nutrition yet
      },
    ]);
    expect(totals[0]).toEqual({ date: '2026-07-13', calories: 600, protein: 40, carbs: 60, fat: 20 });
    expect(totals[1]).toEqual({ date: '2026-07-14', calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('emits zeroed days even with no entries', () => {
    expect(computeDayTotals(days, [])).toEqual([
      { date: '2026-07-13', calories: 0, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-07-14', calories: 0, protein: 0, carbs: 0, fat: 0 },
    ]);
  });
});

describe('missingIngredientNames', () => {
  it('skips names already on the list, case-insensitively', () => {
    expect(missingIngredientNames(['Milk', ' eggs '], ['milk', 'Eggs', 'Flour'])).toEqual(['Flour']);
  });

  it('dedupes within the new names, first-seen casing wins, trims', () => {
    expect(missingIngredientNames([], [' Olive oil ', 'olive Oil', 'garlic'])).toEqual([
      'Olive oil',
      'garlic',
    ]);
  });

  it('drops blank names', () => {
    expect(missingIngredientNames([], ['', '   '])).toEqual([]);
  });
});
