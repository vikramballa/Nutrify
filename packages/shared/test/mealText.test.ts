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
