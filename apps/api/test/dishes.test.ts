import { describe, it, expect } from 'vitest';
import { macrosConsistent } from '@nutrichef/shared';
import { DISHES } from '../src/services/nutritionTables.js';
import { dishFor, dishMeasure, resolveMeasure } from '../src/services/nutritionData.js';

/** kcal a typed item comes to through the dish path. */
function kcal(measure: string, name: string): { grams: number; calories: number } | null {
  const dish = dishFor(name);
  if (!dish) return null;
  const grams = dishMeasure(measure, dish).grams;
  return { grams: Math.round(grams), calories: Math.round((dish.per100.calories * grams) / 100) };
}

describe('DISHES table', () => {
  it('every entry passes the 4/4/9 energy check', () => {
    const bad = Object.entries(DISHES)
      .filter(([, d]) => !macrosConsistent(d.per100))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('every key reads as itself — no plain food further right shadows it', () => {
    const shadowed = Object.keys(DISHES).filter((k) => dishFor(k) !== DISHES[k]);
    expect(shadowed).toEqual([]);
  });
});

describe('Indian meals as people type them', () => {
  it('counts tiffin items by the piece', () => {
    expect(kcal('2', 'idli')).toEqual({ grams: 80, calories: 110 });
    expect(kcal('1', 'masala dosa')).toEqual({ grams: 200, calories: 330 });
    expect(kcal('3', 'roti')).toEqual({ grams: 120, calories: 336 });
    expect(kcal('2', 'medu vada')).toEqual({ grams: 100, calories: 290 });
  });

  it('reads plate, katori and bowl against the dish, not 60 g', () => {
    expect(kcal('1 plate', 'biryani')?.grams).toBe(300);
    expect(kcal('1 plate', 'poha')).toEqual({ grams: 180, calories: 326 });
    expect(kcal('1 katori', 'dal')).toEqual({ grams: 150, calories: 165 });
    expect(kcal('1 bowl', 'sambar')?.grams).toBe(250);
    // Was 195 g of DRY rice — about 700 kcal.
    expect(kcal('1 bowl', 'curd rice')).toEqual({ grams: 225, calories: 338 });
  });

  it('pours chai and coffee into a tea cup', () => {
    expect(kcal('1 cup', 'chai')).toEqual({ grams: 150, calories: 83 });
    expect(kcal('1 cup', 'black coffee')?.grams).toBe(240);
  });

  it('means one serving when there is no number', () => {
    expect(kcal('', 'upma')?.grams).toBe(200);
    expect(kcal('1', 'pongal')?.grams).toBe(200); // not a piece
  });

  it('keeps names that are dishes apart from ingredients', () => {
    expect(dishFor('dosa batter')).toBeNull(); // batter, a STATIC food
    expect(dishFor('paneer')).toBeNull();
    expect(dishFor('basmati rice')).toBeNull();
    expect(dishFor('chicken 65')).toBe(DISHES['chicken 65']);
    expect(dishFor('Chicken Biryani')).toBe(DISHES['chicken biryani']);
    expect(dishFor('2 masala dosas')).toBe(DISHES['masala dosa']);
  });
});

describe('serving units on plain foods', () => {
  it('reads "1 plate" of rice as a plate, and ignores "for serving"', () => {
    expect(resolveMeasure('1 plate', 'rice', 'cooked')).toEqual({ grams: 250, basis: 'unit' });
    expect(resolveMeasure('for serving', 'lemon wedges').basis).not.toBe('unit');
    expect(resolveMeasure('1 katori', 'yogurt').grams).toBeCloseTo(154.5);
  });
});
