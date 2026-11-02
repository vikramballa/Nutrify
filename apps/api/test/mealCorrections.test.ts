import { describe, it, expect } from 'vitest';
import {
  applyCorrection,
  cleanDishName,
  correctionHints,
  correctionKey,
  findCorrection,
  type Correction,
} from '../src/services/mealCorrections.js';
import { visionUserPrompt } from '../src/services/ai/prompts.js';

const scan = {
  name: 'Chicken Curry',
  confidence: 0.7,
  items: [{ name: 'chicken curry', grams: 250 }],
  calories: 400,
  protein: 30,
  carbs: 10,
  fat: 25,
};

const lesson = (predictedName: string, correctName: string): Correction => ({
  predictedKey: correctionKey(predictedName),
  predictedName,
  correctName,
});

describe('correctionKey', () => {
  it('ignores case, punctuation, word order and filler words', () => {
    expect(correctionKey('Rice with Dal')).toBe(correctionKey('dal & rice'));
    expect(correctionKey('A plate of Chicken-Curry!')).toBe(correctionKey('chicken curry'));
  });

  it('keeps different dishes apart', () => {
    expect(correctionKey('Chicken curry')).not.toBe(correctionKey('Chicken curry with rice'));
  });

  it('strips accents', () => {
    expect(correctionKey('Crème brûlée')).toBe('brulee creme');
  });
});

describe('cleanDishName', () => {
  it('flattens to one safe line', () => {
    expect(cleanDishName('  Gongura\n"chicken" {x}  ')).toBe('Gongura chicken x');
  });

  it('caps the length', () => {
    expect(cleanDishName('a'.repeat(200))).toHaveLength(80);
  });
});

describe('applyCorrection', () => {
  it('renames a scan the user corrected before', () => {
    const out = applyCorrection(scan, [lesson('chicken curry', 'Gongura chicken')]);
    expect(out.name).toBe('Gongura chicken');
    expect(out.modelName).toBe('Chicken Curry');
    expect(out.learned).toBe(true);
    expect(out.calories).toBe(400);
  });

  it('leaves an unknown dish alone', () => {
    const out = applyCorrection(scan, [lesson('Paneer tikka', 'Tandoori paneer')]);
    expect(out).toMatchObject({ name: 'Chicken Curry', modelName: 'Chicken Curry', learned: false });
  });

  it('uses the first (newest) matching lesson', () => {
    const hit = findCorrection('chicken curry', [
      lesson('Chicken curry', 'Chicken chettinad'),
      lesson('chicken curry', 'Gongura chicken'),
    ]);
    expect(hit?.correctName).toBe('Chicken chettinad');
  });
});

describe('correctionHints', () => {
  it('is empty with nothing learned', () => {
    expect(correctionHints([])).toBe('');
  });

  it('lists lessons and lands in the vision prompt', () => {
    const hints = correctionHints([lesson('Chicken curry', 'Gongura "chicken"')]);
    expect(hints).toContain('you said "Chicken curry" but it was "Gongura chicken"');
    expect(visionUserPrompt({ hints })).toContain(hints);
  });

  it('caps the number of hints', () => {
    const many = Array.from({ length: 40 }, (_, i) => lesson(`dish ${i}`, `real ${i}`));
    expect(correctionHints(many).split('\n- ').length - 1).toBe(15);
  });
});

describe('visionUserPrompt', () => {
  it('pins the dish when the user named it', () => {
    expect(visionUserPrompt({ dish: 'Gongura chicken' })).toMatch(/^The user says this dish is "Gongura chicken"/);
  });

  it('is unchanged without options', () => {
    expect(visionUserPrompt()).toMatch(/^Identify the meal/);
  });
});
