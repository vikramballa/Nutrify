import { describe, it, expect } from 'vitest';
import { macrosForGrams, parseOffProduct } from '../src/services/foodProducts.js';

describe('parseOffProduct', () => {
  it('reads per-100g macros, first brand and serving grams', () => {
    const p = parseOffProduct({
      product: {
        product_name: 'Nutella',
        brands: 'Ferrero, Nutella',
        serving_quantity: '15',
        nutriments: {
          'energy-kcal_100g': 539,
          proteins_100g: 6.3,
          carbohydrates_100g: '57.5',
          fat_100g: 30.9,
        },
      },
    });
    expect(p).toEqual({
      name: 'Nutella',
      brand: 'Ferrero',
      servingGrams: 15,
      calories: 539,
      protein: 6.3,
      carbs: 57.5,
      fat: 30.9,
    });
  });

  it('falls back to kJ when kcal is missing', () => {
    const p = parseOffProduct({ product: { product_name: 'X', nutriments: { energy_100g: 418.4 } } });
    expect(p?.calories).toBe(100);
    expect(p?.protein).toBe(0);
  });

  it('rejects products without an energy value', () => {
    expect(parseOffProduct({ product: { product_name: 'X', nutriments: {} } })).toBeNull();
    expect(parseOffProduct({ status: 0 })).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
  });

  it('names nameless products and drops absurd servings', () => {
    const p = parseOffProduct({
      product: { brands: 'Acme', serving_quantity: 5000, nutriments: { 'energy-kcal_100g': 50 } },
    });
    expect(p?.name).toBe('Acme');
    expect(p?.servingGrams).toBeNull();
  });
});

describe('macrosForGrams', () => {
  it('scales per-100g values and rounds like a meal log', () => {
    const product = {
      barcode: '12345678',
      name: 'X',
      brand: null,
      servingGrams: null,
      per100g: { calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
    };
    expect(macrosForGrams(product, 30)).toEqual({ calories: 162, protein: 2, carbs: 17, fat: 9 });
  });
});
