import { describe, it, expect } from 'vitest';
import { mergeMealPhoto, photoMeasure } from '../src/services/mealPhoto.js';

const plate = {
  name: 'Idli with sambar',
  confidence: 0.8,
  items: [
    { name: 'idli', grams: 120, count: 3, calories: 250 },
    { name: 'sambar', grams: 150 },
    { name: 'mystery pickle', grams: 30, calories: 60, protein: 1, carbs: 4, fat: 5 },
    { name: 'gunpowder', grams: 10 },
  ],
  calories: 400,
  protein: 12,
  carbs: 60,
  fat: 12,
};

const row = (name: string, grams: number, calories: number, resolved = true) => ({
  name,
  measure: '',
  grams,
  resolved,
  calories,
  protein: 1,
  carbs: 2,
  fat: 3,
});

describe('mergeMealPhoto', () => {
  it('takes table macros for known items and the model for the rest', () => {
    const out = mergeMealPhoto(plate, [
      row('idli', 120, 166),
      row('sambar', 150, 146),
      row('mystery pickle', 30, 0, false),
      row('gunpowder', 10, 0, false),
    ]);
    expect(out.items.map((i) => [i.name, i.calories, i.matched])).toEqual([
      ['idli', 166, true],
      ['sambar', 146, true],
      ['mystery pickle', 60, false], // its own numbers
      ['gunpowder', 13, false], // 10/310 of the model's 400 kcal
    ]);
    expect(out.calories).toBe(166 + 146 + 60 + 13);
    expect(out.items[0].count).toBe(3);
  });

  it('leaves an item-less answer untouched', () => {
    const empty = { ...plate, items: [] };
    expect(mergeMealPhoto(empty, [])).toEqual(empty);
  });
});

describe('photoMeasure', () => {
  it('counts pieces only for dishes eaten by the piece', () => {
    expect(photoMeasure({ name: 'idli', grams: 100, count: 3 }).measure).toBe('3');
    expect(photoMeasure({ name: 'sambar', grams: 280, count: 1 }).measure).toBe('280 g');
    expect(photoMeasure({ name: 'mystery curry', grams: 200, count: 2 }).measure).toBe('200 g');
  });
});
