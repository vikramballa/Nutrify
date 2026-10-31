import { describe, it, expect } from 'vitest';
import {
  NutritionLabelAnalysisSchema,
  labelAnalysisFromParsed,
  macrosConsistent,
  ocrRows,
  parseLabelText,
} from '../src/index.js';

const round = (m: Record<string, number> | null) =>
  m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 10) / 10]));

describe('ocrRows', () => {
  it('rebuilds table rows from separate boxes, left to right', () => {
    const rows = ocrRows([
      { text: '6.8', x: 0.6, y: 0.301, w: 0.1, h: 0.03 },
      { text: 'Protein (g)', x: 0.05, y: 0.3, w: 0.3, h: 0.03 },
      { text: '2.0', x: 0.8, y: 0.305, w: 0.1, h: 0.03 },
      { text: 'Energy (kcal)', x: 0.05, y: 0.25, w: 0.3, h: 0.03 },
      { text: '512', x: 0.6, y: 0.252, w: 0.1, h: 0.03 },
    ]);
    expect(rows).toEqual(['Energy (kcal) 512', 'Protein (g) 6.8 2.0']);
  });
});

describe('parseLabelText', () => {
  it('reads an Indian two-column panel (per 100 g + per serve)', () => {
    const label = parseLabelText([
      'NUTRITIONAL INFORMATION (Approx.)',
      'Per 100g Per serve (30g)',
      'Energy (kcal) 512 154',
      'Protein (g) 6.8 2.0',
      'Carbohydrate (g) 62.1 18.6',
      'of which Total Sugars (g) 18.0 5.4',
      'Total Fat (g) 26.0 7.8',
      'Saturated Fat (g) 12.1 3.6',
      'Net Wt. 200 g',
    ]);
    expect(round(label!.per100g)).toEqual({ calories: 512, protein: 6.8, carbs: 62.1, fat: 26 });
    expect(round(label!.perServing)).toEqual({ calories: 154, protein: 2, carbs: 18.6, fat: 7.8 });
    expect(label!.servingGrams).toBe(30);
    expect(label!.packGrams).toBe(200);
  });

  it('reads a per-100 g-only panel and ignores a "Serving size" line above it', () => {
    const label = parseLabelText([
      'Serving size: 25 g',
      'Nutrition Information per 100 g',
      'Energy 2142 kJ / 512 kcal',
      'Protein 7 g',
      'Carbohydrates 60 g',
      'Fat 27 g',
    ]);
    expect(round(label!.per100g)).toEqual({ calories: 512, protein: 7, carbs: 60, fat: 27 });
    // Derived from the serving weight.
    expect(round(label!.perServing)).toEqual({ calories: 128, protein: 1.8, carbs: 15, fat: 6.8 });
    expect(label!.servingGrams).toBe(25);
  });

  it('converts kJ-only energy and kJ/kcal pairs', () => {
    const kj = parseLabelText(['per 100 g', 'Energy (kJ) 1674', 'Protein 10 g', 'Carbohydrate 60 g', 'Fat 12 g']);
    expect(Math.round(kj!.per100g!.calories)).toBe(400);
    const pairs = parseLabelText([
      'Per 100 g Per serve 40 g',
      'Energy (kJ/kcal) 2142/512 857/205',
      'Protein (g) 6.8 2.7',
      'Carbohydrate (g) 62.1 24.8',
      'Fat (g) 26.0 10.4',
    ]);
    expect(pairs!.per100g!.calories).toBe(512);
    expect(pairs!.perServing!.calories).toBe(205);
  });

  it('reads a US Nutrition Facts panel as per serving, skipping %DV', () => {
    const label = parseLabelText([
      'Nutrition Facts',
      '8 servings per container',
      'Serving size 2/3 cup (55g)',
      'Calories 230',
      'Total Fat 8g 10%',
      'Saturated Fat 1g 5%',
      'Trans Fat 0g',
      'Cholesterol 0mg 0%',
      'Sodium 160mg 7%',
      'Total Carbohydrate 37g 13%',
      'Dietary Fiber 4g 14%',
      'Total Sugars 12g',
      'Protein 3g',
    ]);
    expect(round(label!.perServing)).toEqual({ calories: 230, protein: 3, carbs: 37, fat: 8 });
    expect(label!.servingGrams).toBe(55);
    expect(label!.servingSize).toBe('2/3 cup (55g)');
    expect(label!.servingsPerContainer).toBe(8);
    expect(Math.round(label!.per100g!.calories)).toBe(418);
  });

  it('handles decimal commas', () => {
    const label = parseLabelText(['per 100 g', 'Energy 380 kcal', 'Protein 12,5 g', 'Carbohydrate 70,2 g', 'Fat 5,1 g']);
    expect(label!.per100g!.protein).toBe(12.5);
  });

  it('rejects text whose numbers do not add up, or that is not a label', () => {
    // Energy 900 with tiny macros: misread digits, not a label to trust.
    expect(parseLabelText(['per 100 g', 'Energy 900 kcal', 'Protein 1 g', 'Carbohydrate 2 g', 'Fat 3 g'])).toBeNull();
    expect(parseLabelText(['Best before 6 months', 'MRP Rs 20'])).toBeNull();
  });

  it('macrosConsistent tolerates fibre drift but not nonsense', () => {
    expect(macrosConsistent({ calories: 230, protein: 3, carbs: 37, fat: 8 })).toBe(true);
    expect(macrosConsistent({ calories: 50, protein: 20, carbs: 40, fat: 10 })).toBe(false);
  });
});

describe('labelAnalysisFromParsed', () => {
  it('shows per-100 g numbers as the serving when the label prints no serving', () => {
    const parsed = parseLabelText(['per 100 g', 'Energy 512 kcal', 'Protein 7 g', 'Carbohydrate 60 g', 'Fat 27 g', 'Net Wt 150 g'])!;
    const out = labelAnalysisFromParsed(parsed);
    expect(out).toMatchObject({ servingSize: '100 g', servingGrams: 100, calories: 512, packGrams: 150, source: 'device' });
    expect(NutritionLabelAnalysisSchema.safeParse(out).success).toBe(true);
  });
});
