import type { MealPhotoAnalysis } from '@nutrichef/shared';
import { dishFor, macrosForItems, type ItemMacros } from './nutritionData.js';

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const;

/**
 * Re-price a meal-photo estimate through the nutrition tables. The model is
 * good at naming what is on the plate and judging amounts; its calorie
 * arithmetic is a guess. Items the tables know (idli, sambar, rice, dal…) take
 * table macros at the model's count or weight. The rest keep the model's own
 * per-item numbers, or, if it gave none, their weight's share of its total.
 *
 * The lookup skips USDA: an unknown item already has a fallback, so a slow
 * remote call isn't worth the wait.
 */
export async function priceMealPhoto(data: MealPhotoAnalysis): Promise<MealPhotoAnalysis> {
  if (data.items.length === 0) return data;
  const { items: table } = await macrosForItems(data.items.map(photoMeasure), { remote: false });
  return mergeMealPhoto(data, table);
}

/**
 * A count is only trusted for things eaten by the piece ("3 idli" → 3 × 40 g);
 * "1 sambar" is a count of bowls, and the model's grams say how big a bowl.
 */
export function photoMeasure(item: { name: string; grams: number; count?: number }) {
  const counted = item.count && dishFor(item.name)?.piece;
  return { name: item.name, measure: counted ? String(item.count) : `${Math.round(item.grams)} g` };
}

/** The pure half of priceMealPhoto, exported for tests. */
export function mergeMealPhoto(data: MealPhotoAnalysis, table: ItemMacros[]): MealPhotoAnalysis {
  if (data.items.length === 0) return data;
  const modelGrams = data.items.reduce((sum, i) => sum + i.grams, 0) || 1;
  const items = data.items.map((it, i) => {
    const t = table[i];
    if (t?.resolved) {
      return {
        name: it.name,
        grams: t.grams,
        ...(it.count ? { count: it.count } : {}),
        calories: t.calories,
        protein: t.protein,
        carbs: t.carbs,
        fat: t.fat,
        matched: true,
      };
    }
    const share = it.grams / modelGrams;
    const own = MACRO_KEYS.every((k) => it[k] != null);
    return {
      name: it.name,
      grams: it.grams,
      ...(it.count ? { count: it.count } : {}),
      calories: Math.round(own ? it.calories! : data.calories * share),
      protein: Math.round(own ? it.protein! : data.protein * share),
      carbs: Math.round(own ? it.carbs! : data.carbs * share),
      fat: Math.round(own ? it.fat! : data.fat * share),
      matched: false,
    };
  });
  const total = (k: (typeof MACRO_KEYS)[number]) => Math.round(items.reduce((sum, i) => sum + i[k], 0));
  return {
    ...data,
    items,
    calories: total('calories'),
    protein: total('protein'),
    carbs: total('carbs'),
    fat: total('fat'),
  };
}
