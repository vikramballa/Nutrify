import { describe, it, expect } from 'vitest';
import { parseMealText } from '../src/index.js';

describe('parseMealText', () => {
  it('splits on commas, "and", plus and newlines', () => {
    expect(parseMealText('2 eggs, toast and black coffee\n1 banana + 1 apple')).toEqual([
      { name: 'eggs', measure: '2' },
      { name: 'toast', measure: '1' },
      { name: 'black coffee', measure: '1' },
      { name: 'banana', measure: '1' },
      { name: 'apple', measure: '1' },
    ]);
  });

  it('reads leading quantities with units, glued or spaced', () => {
    expect(parseMealText('200g rice, 1 cup of milk, 2 tbsp olive oil')).toEqual([
      { name: 'rice', measure: '200 g' },
      { name: 'milk', measure: '1 cup' },
      { name: 'olive oil', measure: '2 tbsp' },
    ]);
  });

  it('reads trailing quantities', () => {
    expect(parseMealText('chicken curry 300g; Milk 250 ML')).toEqual([
      { name: 'chicken curry', measure: '300 g' },
      { name: 'Milk', measure: '250 ml' },
    ]);
  });

  it('reads fractions and word quantities without eating names', () => {
    expect(parseMealText('1 1/2 cups oats, 1/2 cup yogurt, an apple, two slices bread')).toEqual([
      { name: 'oats', measure: '1 1/2 cups' },
      { name: 'yogurt', measure: '1/2 cup' },
      { name: 'apple', measure: '1' },
      { name: 'bread', measure: '2 slices' },
    ]);
    expect(parseMealText('apple')).toEqual([{ name: 'apple', measure: '1' }]);
    expect(parseMealText('lemon rice')).toEqual([{ name: 'lemon rice', measure: '1' }]);
  });

  it('reads a unit with no number as one of it', () => {
    expect(parseMealText('handful of almonds, bowl of rice, a slice of pizza')).toEqual([
      { name: 'almonds', measure: '1 handful' },
      { name: 'rice', measure: '1 bowl' },
      { name: 'pizza', measure: '1 slice' },
    ]);
  });

  it('drops empty and number-only fragments', () => {
    expect(parseMealText(' , 3 ,, and ')).toEqual([]);
  });
});

describe('parseMealText — Indian household measures', () => {
  it('reads plate, katori, ladle and tumbler as units', () => {
    expect(parseMealText('1 plate poha, 2 katori dal, a ladle of sambar, 1 tumbler buttermilk')).toEqual([
      { name: 'poha', measure: '1 plate' },
      { name: 'dal', measure: '2 katori' },
      { name: 'sambar', measure: '1 ladle' },
      { name: 'buttermilk', measure: '1 tumbler' },
    ]);
  });

  it('splits on "with" and reads counts before or after the food', () => {
    expect(parseMealText('3 idli with sambar, dosa x2, 2 pcs vada, 4x puri')).toEqual([
      { name: 'idli', measure: '3' },
      { name: 'sambar', measure: '1' },
      { name: 'dosa', measure: '2' },
      { name: 'vada', measure: '2' },
      { name: 'puri', measure: '4' },
    ]);
  });

  it('keeps a number that is part of the dish name', () => {
    expect(parseMealText('chicken 65')).toEqual([{ name: 'chicken 65', measure: '1' }]);
  });
});
