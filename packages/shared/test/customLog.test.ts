import { describe, expect, it } from 'vitest';
import { CreateCustomLogSchema } from '../src/index';

const base = { name: 'Idli sambar', mealType: 'breakfast', items: [{ name: 'idli', measure: '120 g' }] };

describe('CreateCustomLogSchema memory fields', () => {
  it('accepts a log without them (older app versions)', () => {
    expect(CreateCustomLogSchema.safeParse(base).success).toBe(true);
  });

  it('accepts scan items and a label', () => {
    const parsed = CreateCustomLogSchema.parse({
      ...base,
      scan: { items: [{ name: 'idli', grams: 120, count: 3 }] },
      label: {
        analysis: { productName: 'Marie', servingSize: '25 g', calories: 110, protein: 2, carbs: 19, fat: 3, provider: 'device' },
        grams: 50,
      },
    });
    expect(parsed.scan?.items[0].count).toBe(3);
    expect(parsed.label?.grams).toBe(50);
    expect(parsed.label?.analysis).not.toHaveProperty('provider'); // unknown keys stripped
  });

  it('rejects a bad scan item', () => {
    expect(CreateCustomLogSchema.safeParse({ ...base, scan: { items: [{ name: 'idli', grams: -1 }] } }).success).toBe(false);
  });
});
