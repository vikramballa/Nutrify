import { prisma } from '../lib/prisma.js';
import {
  CONTEXT_UNITS,
  COOKED_DENSITY,
  COOKED_YIELD,
  DENSITY,
  DISHES,
  PIECE_GRAMS,
  SERVING_UNITS,
  STATIC,
  UNIT_GRAMS,
  VOLUME_ML,
  type Dish,
  type Per100g,
} from './nutritionTables.js';

/**
 * Real recipe nutrition, computed from ingredients:
 *   measure string → grams → per-100g macros → summed → per serving.
 * Per-100g data comes from a static table of common ingredients first, then
 * the USDA FoodData Central API (public domain) for unknowns; every lookup is
 * cached forever in IngredientNutrition, so USDA is hit at most once per
 * distinct ingredient — fine even on the shared DEMO_KEY.
 */

// MealDB/AI recipes carry no serving count, so it is estimated from the
// recipe's total cooked weight over a typical portion for its category.
// ponytail: portion sizes are category averages; a per-user override on the
// recipe screen is the upgrade if estimates prove off for specific dishes.
const PORTION_GRAMS: Record<string, number> = {
  dessert: 120,
  starter: 200,
  side: 200,
  breakfast: 300,
  beverage: 250,
  drink: 250,
};
const DEFAULT_PORTION_GRAMS = 350;
// Portions set by what the dish is, whatever category it is filed under. The
// name must END with the word: "Aloo Paratha" is a bread, "Pav Bhaji" is not
// (it was cut into sixteen 90 g "bread" portions).
const NAMED_PORTIONS: [RegExp, number][] = [
  [/\b(roti|naan|paratha|chapati|phulka|puri|poori|bhatura|kulcha|thepla|flatbreads?|bread|buns?|pav|tortillas?)\s*$/i, 90],
  [/\b(chutney|pickle|achar|thokku)\s*$/i, 40],
  [/\braita\s*$/i, 125],
];
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 16; // a large cake is cut into 16

/** Grams in one portion of a recipe, from its name or else its category. */
export function portionGrams(category: string, name = ''): number {
  const named = NAMED_PORTIONS.find(([re]) => re.test(name.trim()));
  return named ? named[1] : (PORTION_GRAMS[category.trim().toLowerCase()] ?? DEFAULT_PORTION_GRAMS);
}

/** Servings a recipe of `totalGrams` makes, clamped to a plausible range. */
export function estimateServings(totalGrams: number, category: string, name = ''): number {
  const portion = portionGrams(category, name);
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(totalGrams / portion)));
}

const WATER = /^(water|cold water|hot water|warm water|boiling water|ice|ice water)$/;

// Deep-frying oil mostly stays in the pan; fried food absorbs roughly 15% of
// it. Counting the first 120 g in full as well read 500 ml of vada oil as
// 170 g eaten.
// ponytail: past a sautéing amount, oil in a savoury dish is assumed to be for
// frying; a sauce that truly takes 300 ml of oil is undercounted. Bakes are
// exempt — a carrot cake's 450 ml of oil is all eaten — unless the method
// fries: the 500 ml under a jalebi was counted in full (634 kcal a serving).
const SAUTE_OIL_GRAMS = 120;
const FRYING_ABSORPTION = 0.15;
const BAKED = /^(dessert|cake|baking)$/;
const FAT_FOR_FRYING = /\b(oil|ghee)\b/;
const FRIES = /\b(deep[- ]?fr\w*|fry|fried|frying)\b/i;
// Sweets fried then soaked in syrup absorb about half of it; the rest stays in
// the pan. ponytail: a flat half — the real share depends on soak time.
const SYRUP_SOAKED = /\b(jamun|jalebi|jilebi|imarti|rasgulla|rasagulla|rosogolla|balushahi|malpua|chamcham)s?\b/i;
const SYRUP_SHARE = 0.5;
const SYRUP_PART = /^(sugar|water|jaggery)$/;

/** Grams of an ingredient that are eaten, given the recipe it is in. */
function eatenGrams(
  name: string,
  grams: number,
  recipe: { name: string; category: string; instructions?: string },
): number {
  const n = name.trim().toLowerCase();
  const baked = BAKED.test(recipe.category.trim().toLowerCase()) && !FRIES.test(recipe.instructions ?? '');
  if (FAT_FOR_FRYING.test(n) && !baked && grams > SAUTE_OIL_GRAMS) return grams * FRYING_ABSORPTION;
  if (SYRUP_SOAKED.test(recipe.name) && SYRUP_PART.test(n)) return grams * SYRUP_SHARE;
  return grams;
}

// Keys match whole words, plurals allowed ("onions", "tomatoes", "cherries").
// Plain substring matching read "eggplant" as egg, "goat" as oat, "pear" as
// pea, "steak" as tea and "pineapple" as a 180 g apple.
const LETTER = 'a-zà-ÿ';

function wordMatcher(keys: string[]): (name: string) => { key: string; end: number } | null {
  const patterns = keys.map((key) => {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plural = key.endsWith('y') ? `|${k.slice(0, -1)}ies` : '';
    return { key, re: new RegExp(`(?<![${LETTER}])(?:${k}(?:s|es)?${plural})(?![${LETTER}])`, 'g') };
  });
  // The food is the last word ("butter beans" are beans, "chicken stock" is
  // stock), so the key matching furthest right wins; ties go to the longer,
  // more specific key ("peanut butter" over "butter").
  return (name) => {
    const n = name.toLowerCase();
    let best: { end: number; key: string } | null = null;
    for (const { key, re } of patterns) {
      for (const m of n.matchAll(re)) {
        const end = m.index! + m[0].length;
        if (!best || end > best.end || (end === best.end && key.length > best.key.length)) {
          best = { end, key };
        }
      }
    }
    return best;
  };
}

const staticMatch = wordMatcher(Object.keys(STATIC));
const dishMatch = wordMatcher(Object.keys(DISHES));

/** Which static-table food a name reads as, or null. */
export function staticKey(name: string): string | null {
  return staticMatch(name)?.key ?? null;
}

/**
 * The prepared dish a typed or scanned name means — unless a plain food sits
 * further right ("dosa batter" is batter, "masala dosa" is the dosa), or the
 * same place with a more specific name ("mint chutney" over "chutney").
 * Recipe ingredients never come here: a recipe's "rajma" is dry beans.
 */
export function dishFor(name: string): Dish | null {
  const dish = dishMatch(name);
  if (!dish) return null;
  const plain = staticMatch(name);
  if (!plain || dish.end > plain.end) return DISHES[dish.key];
  return dish.end === plain.end && dish.key.length >= plain.key.length ? DISHES[dish.key] : null;
}

export function staticLookup(name: string): Per100g | null {
  const key = staticKey(name);
  return key ? STATIC[key] : null;
}

const pieceMatch = wordMatcher(Object.keys(PIECE_GRAMS));
const pieceKey = (name: string) => pieceMatch(name)?.key ?? null;
const densityMatch = wordMatcher(Object.keys(DENSITY));
const densityKey = (name: string) => densityMatch(name)?.key ?? null;

const DEFAULT_PIECE_GRAMS = 60;
const DEFAULT_GRAMS = 50; // unparseable measure — assume a modest amount
const FAT_SPOON_GRAMS = 15; // an unmeasured oil or butter is about a tablespoon
const TRACE_GRAMS = 5;
const FRYING_GRAMS = 10;
// "to taste", "for dusting" — a garnish, not a 50 g portion. Checked only when
// the measure has no number, so "2 tbsp grated parmesan" still counts in full.
const TRACE = /\b(taste|garnish|dust|dusting|sprink\w*|spink\w*|serve|serving|topping|grated|grating|shaved|optional|decorat\w*|drizzle|glaze|glazing)\b/;
const FRYING = /\b(fry|frying|fried|brush|brushing|grease|greasing)\b/;
const FAT = /\b(oil|butter|ghee|lard)\b/;

/** Grams per ml for a food; 1 (water) when it isn't listed. */
function densityOf(name: string): number {
  const key = densityKey(name);
  return key ? DENSITY[key] : 1;
}

/** How a measure became grams — anything but 'unit' or 'piece' is a guess. */
export type MeasureBasis = 'unit' | 'piece' | 'trace' | 'default-piece' | 'default';

type UnitKind = 'volume' | 'weight' | 'context' | 'serving';

// Unit words, longest first so "fl oz" beats "oz" and "tbsp" beats "tbs".
const UNIT_WORDS = [
  ...Object.keys(VOLUME_ML).map((u) => ({ u, kind: 'volume' as const })),
  ...Object.keys(UNIT_GRAMS).map((u) => ({ u, kind: 'weight' as const })),
  ...Object.keys(CONTEXT_UNITS).map((u) => ({ u, kind: 'context' as const })),
  ...Object.keys(SERVING_UNITS).map((u) => ({ u, kind: 'serving' as const })),
].map(({ u, kind }) => ({ u, kind, re: new RegExp(`(^|\\d|\\s)${u}(es\\b|s\\b|\\b)`) }));

/** Quantity and unit of a measure string: "1 1/2 cups" → 1.5 × cup. */
function readMeasure(measure: string): {
  qty: number;
  counted: boolean;
  unit: { u: string; kind: UnitKind } | null;
} {
  const m = measure.trim().toLowerCase();

  // quantity: "1", "1.5", "1/2", "1 1/2", "½"
  let qty = 1;
  const num = m.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)/);
  if (num) {
    const s = num[1];
    if (s.includes('/')) {
      const [whole, frac] = s.includes(' ') ? s.split(/\s+/) : ['0', s];
      const [a, b] = frac.split('/').map(Number);
      qty = Number(whole) + (b ? a / b : 0);
    } else {
      qty = Number(s);
    }
  } else if (/½/.test(m)) qty = 0.5;
  else if (/¼/.test(m)) qty = 0.25;
  else if (/¾/.test(m)) qty = 0.75;
  const counted = num != null || /[½¼¾]/.test(m) || /^(a|an|one|two|three)\b/.test(m);

  // The unit written first wins: "50ml/2fl oz" is 50 ml, not 50 oz.
  let best: { at: number; len: number; u: string; kind: UnitKind } | null = null;
  for (const { u, kind, re } of UNIT_WORDS) {
    // "for serving" is a garnish; only "2 servings" is a portion.
    if (kind === 'serving' && !counted) continue;
    const hit = re.exec(m);
    if (!hit) continue;
    const at = hit.index + hit[1].length;
    if (!best || at < best.at || (at === best.at && u.length > best.len)) {
      best = { at, len: u.length, u, kind };
    }
  }
  return { qty, counted, unit: best && { u: best.u, kind: best.kind } };
}

/**
 * "1 1/2 cups" flour → 191 g; "200g" → 200; "2" (Eggs) → 2 × piece weight.
 * Volumes are scaled by the food's density; unit-less counts use a piece
 * weight for that food.
 */
export function resolveMeasure(
  measure: string,
  ingredientName: string,
  state: FoodState = 'dry',
): { grams: number; basis: MeasureBasis } {
  const m = measure.trim().toLowerCase();
  const name = ingredientName.toLowerCase();
  const { qty, counted, unit } = readMeasure(measure);

  if (unit) {
    if (unit.kind === 'volume') {
      // A cup of cooked pasta is heavier than a cup of dry shapes.
      const key = staticKey(name);
      const cooked = key && COOKED_DENSITY[key] && yieldFor(name, measure, state).state === 'cooked';
      const density = cooked ? COOKED_DENSITY[key] : densityOf(name);
      return { grams: qty * VOLUME_ML[unit.u] * density, basis: 'unit' };
    }
    if (unit.kind === 'context') {
      const ctx = CONTEXT_UNITS[unit.u];
      const food = Object.keys(ctx.byFood).find((f) => name.includes(f));
      return { grams: qty * (food ? ctx.byFood[food] : ctx.otherwise), basis: 'unit' };
    }
    if (unit.kind === 'serving') return { grams: qty * SERVING_UNITS[unit.u], basis: 'unit' };
    return { grams: qty * UNIT_GRAMS[unit.u], basis: 'unit' };
  }

  if (!counted) {
    if (FRYING.test(m)) return { grams: FRYING_GRAMS, basis: 'trace' };
    if (TRACE.test(m)) return { grams: TRACE_GRAMS, basis: 'trace' };
    if (FAT.test(name)) return { grams: FAT_SPOON_GRAMS, basis: 'default' };
    // "Avocado (peeled and sliced)", "Egg yolks (beaten)" — one of them.
    const one = pieceKey(name);
    if (one) return { grams: PIECE_GRAMS[one], basis: 'piece' };
    return { grams: DEFAULT_GRAMS, basis: 'default' };
  }

  // No unit — it's a count of items ("2 Eggs", "1 Onion").
  const token = pieceKey(name);
  return token
    ? { grams: qty * PIECE_GRAMS[token], basis: 'piece' }
    : { grams: qty * DEFAULT_PIECE_GRAMS, basis: 'default-piece' };
}

/**
 * Grams of a prepared dish: "3" idli are three pieces, "1 plate" of upma is
 * its serving, "1 katori" dal is 150 ml of dal. No number means one serving.
 */
export function dishMeasure(measure: string, dish: Dish): { grams: number; basis: MeasureBasis } {
  const { qty, counted, unit } = readMeasure(measure);
  if (unit) {
    if (unit.kind === 'serving') return { grams: qty * dish.serving, basis: 'unit' };
    if (unit.kind === 'volume') {
      const ml = unit.u === 'cup' && dish.cup ? dish.cup : VOLUME_ML[unit.u];
      return { grams: qty * ml * (dish.density ?? 1), basis: 'unit' };
    }
    if (unit.kind === 'weight') return { grams: qty * UNIT_GRAMS[unit.u], basis: 'unit' };
    // "a packet", "a slice" of a dish: one piece of it.
    return { grams: qty * (dish.piece ?? dish.serving), basis: 'unit' };
  }
  if (!counted) return { grams: dish.serving, basis: 'piece' };
  return { grams: qty * (dish.piece ?? dish.serving), basis: 'piece' };
}

export function measureToGrams(
  measure: string,
  ingredientName: string,
  state: FoodState = 'dry',
): number {
  return resolveMeasure(measure, ingredientName, state).grams;
}

/** Whether a food is eaten cooked or dry — only matters for COOKED_YIELD foods. */
export type FoodState = 'dry' | 'cooked';
const SAYS_COOKED = /\b(cooked|boiled|steamed|leftover|day-old)\b/;
const SAYS_DRY = /\b(dry|dried|uncooked|raw)\b/;

/** The cooked-yield factor for a grain/pulse in the given state, else 1. */
function yieldFor(name: string, measure: string, fallback: FoodState): { factor: number; state: FoodState } {
  const key = staticKey(name);
  const factor = key ? COOKED_YIELD[key] : undefined;
  if (!factor) return { factor: 1, state: fallback };
  const text = `${name} ${measure}`.toLowerCase();
  const state = SAYS_COOKED.test(text) ? 'cooked' : SAYS_DRY.test(text) ? 'dry' : fallback;
  return { factor, state };
}

/**
 * Per-100g for the state the food is actually in. Grains and pulses are
 * stored dry; a recipe line is dry unless it says otherwise, while a typed
 * log ("200g rice") is cooked unless it says otherwise.
 */
export function forState(
  name: string,
  measure: string,
  per100: Per100g,
  fallback: FoodState,
): Per100g {
  const { factor, state } = yieldFor(name, measure, fallback);
  if (factor === 1 || state === 'dry') return per100;
  return {
    calories: per100.calories / factor,
    protein: per100.protein / factor,
    carbs: per100.carbs / factor,
    fat: per100.fat / factor,
  };
}

/**
 * Grams a recipe line adds to the finished dish's weight, for estimating
 * servings. Dry grains swell ("2 cups basmati" is ~1 kg cooked). Meat keeps
 * its raw weight: portion sizes were set against raw weights, and shrinking
 * it made four chicken thighs one 951 kcal serving. Water is added
 * separately, less what the grains drank.
 */
function dishGrams(name: string, measure: string, grams: number): number {
  const { factor, state } = yieldFor(name, measure, 'dry');
  return state === 'dry' && factor > 1 ? grams * factor : grams;
}

// Simmering drives some water off. ponytail: a flat fifth — a long-reduced dal
// loses more, a quick soup less; it only moves the serving weight shown and
// the estimate for recipes that don't state their servings.
const EVAPORATED = 0.2;

/**
 * Water a recipe's dry grains absorb while cooking. Only that much of the
 * recipe's water disappears into the grain; the rest is still in the pot. A
 * teaspoon of urad dal in an upma used to cancel all 2.5 cups of its water,
 * making the upma one 917 kcal serving.
 */
function absorbedWater(lines: { name: string; measure: string; grams: number }[]): number {
  let absorbed = 0;
  for (const l of lines) {
    const { factor, state } = yieldFor(l.name, l.measure, 'dry');
    if (factor > 1 && state === 'dry') absorbed += l.grams * (factor - 1);
  }
  return absorbed;
}

const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// USDA nutrient numbers. Foundation foods often report energy only as 957/958
// (Atwater factors) instead of 208 — reading 208 alone stored raspberries,
// fennel and Monterey Jack at 0 kcal.
const MACRO_NUMBERS = { '203': 'protein', '205': 'carbs', '204': 'fat' } as const;
const ENERGY_NUMBERS = ['208', '957', '958'];

interface UsdaFood {
  description?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
}

/** Per-100g from a USDA food; energy computed from macros if none is reported. */
export function usdaMacros(food: UsdaFood): Per100g | null {
  const out: Per100g = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let energy: number | null = null;
  for (const n of food.foodNutrients ?? []) {
    const num = n.nutrientNumber ?? '';
    const field = MACRO_NUMBERS[num as keyof typeof MACRO_NUMBERS];
    if (field) out[field] = n.value ?? 0;
    if (ENERGY_NUMBERS.includes(num) && n.value && energy == null) energy = n.value;
  }
  out.calories = energy ?? Math.round(out.protein * 4 + out.carbs * 4 + out.fat * 9);
  return out.calories > 0 || out.protein > 0 ? out : null;
}

// Search results that are never what a recipe ingredient means.
const NOT_AN_INGREDIENT =
  /\b(babyfood|baby food|fast foods?|restaurant|candies|snacks?|cereals ready-to-eat|denny's|applebee's|olive garden|carrabba's|kfc|mcdonald's|burger king|pizza hut|taco bell|subway|smart soup|nestle|quaker|mars snackfood|navajo|shoshone|apache|hopi)\b/;
const PROCESSED = /\b(dry mix|mix, dry|dehydrated|prepared from recipe|with added)\b/;
const QUALIFIERS =
  /^(fresh|chopped|ground|sliced|diced|minced|large|small|medium|organic|whole|finely|roughly|grated|shredded|boneless|skinless|ripe|frozen|canned|tinned|raw|dried|dry|of|and|the|for|to|with)$/;
// Words in a USDA description that describe the food rather than name another.
const DESCRIPTORS =
  /^(raw|ripe|dried|dry|fresh|cooked|boiled|canned|frozen|whole|ground|plain|regular|enriched|unenriched|prepared|ready|serve|solid|halves|mature|immature|seeds?|kernels?|and|with|without|or|in|of|to)$/;

/** Crude singular, enough to find a word inside a USDA description. */
function stem(w: string): string {
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`; // berries → berry
  if (w.endsWith('oes')) return w.slice(0, -2); // tomatoes → tomato
  if (/(ch|sh|ss|x)es$/.test(w)) return w.slice(0, -2); // radishes → radish
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); // olives → olive
  return w;
}

/**
 * Which of USDA's search results actually is the ingredient, or -1. Taking
 * the top hit matched mint to After Eight candies, mozzarella to Applebee's
 * sticks and olives to pork olive loaf.
 *
 * USDA names foods as comma segments, often category first ("Cheese,
 * mozzarella, whole milk"), so the query's main word (its last) must be one of
 * the first three segments' words — the earlier, the better — and words there
 * that name some other food ("Olive *loaf*, pork") count against it.
 */
export function pickUsdaFood(query: string, foods: { description?: string }[]): number {
  // "queso fresco or feta" — any of them will do; take the last.
  const last = query.toLowerCase().replace(/\(.*?\)/g, ' ').split(/\bor\b/).pop() ?? '';
  const words = last
    .split(/[^a-zà-ÿ]+/)
    .filter((w) => w.length >= 3 && !QUALIFIERS.test(w))
    .map(stem);
  if (words.length === 0) return -1;
  const head = words[words.length - 1];
  const modifiers = words.slice(0, -1);
  // "mint" matches "mints" and "spearmint", but "peel" never matches "peeled".
  const names = (w: string, q: string) => {
    const x = stem(w);
    return x === q || x.endsWith(q);
  };
  const wordsOf = (seg: string) => seg.split(/[^a-zà-ÿ]+/).filter(Boolean);

  let best = -1;
  let bestScore = -Infinity;
  foods.forEach((f, i) => {
    const d = (f.description ?? '').toLowerCase();
    const segs = d.split(',').map(wordsOf);
    const at = segs.slice(0, 3).findIndex((seg) => seg.some((w) => names(w, head)));
    if (at < 0) return;
    const all = segs.flat();
    const found = modifiers.filter((q) => all.some((w) => names(w, q)));
    // The modifier is usually what the food is: "caesar" dressing, "miso"
    // paste, "poppy" seeds. None of them present means some other food.
    if (modifiers.length > 0 && found.length === 0) return;
    let score = 4 - at + found.length;
    // Words beside the name that name some other food ("Olive *loaf*",
    // "sesame *butter*, tahini") count against it.
    const other = (w: string) => !DESCRIPTORS.test(w) && !words.some((q) => names(w, q));
    score -= segs[at].filter(other).length;
    score -= Math.min(1, (segs[at + 1] ?? []).filter(other).length * 0.5);
    if (NOT_AN_INGREDIENT.test(d) || /\b[A-Z]{4,}/.test(f.description ?? '')) score -= 10;
    if (PROCESSED.test(d)) score -= 3;
    score -= d.length / 200; // shorter = more generic
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore > 0 ? best : -1;
}

// After a 429 every further call fails too, and each one used to cost a
// round trip on the request path. Stay off USDA for a while instead.
const USDA_BACKOFF_MS = 15 * 60_000;
let usdaBlockedUntil = 0;

/**
 * USDA per-100g macros. 'miss' = USDA answered and has no such food (safe to
 * cache); null = USDA failed or is rate-limited (must NOT be cached, or one
 * bad hour would zero that ingredient forever).
 */
async function usdaLookup(name: string): Promise<Per100g | 'miss' | null> {
  if (Date.now() < usdaBlockedUntil) return null;
  const key = process.env.FDC_API_KEY || 'DEMO_KEY';
  try {
    const params = new URLSearchParams({
      query: name,
      dataType: 'Foundation,SR Legacy',
      pageSize: '25',
    });
    // Key in a header, not ?api_key=: a URL ends up in proxy and error logs.
    const res = await fetch(`${FDC_URL}?${params}`, {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429) {
      usdaBlockedUntil = Date.now() + USDA_BACKOFF_MS;
      console.warn(
        `[nutrition] USDA rate-limited (${key === 'DEMO_KEY' ? 'shared DEMO_KEY — set FDC_API_KEY' : 'FDC_API_KEY'}); pausing lookups for 15 min`,
      );
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { foods?: UsdaFood[] };
    const foods = data.foods ?? [];
    const pick = pickUsdaFood(name, foods);
    return (pick >= 0 && usdaMacros(foods[pick])) || 'miss';
  } catch (err) {
    console.warn('[nutrition] USDA lookup failed:', (err as Error).message);
    return null;
  }
}

const MISS_SOURCE = 'NONE';

/**
 * Per-100g macros for many ingredients: DB cache → static table → USDA.
 * One query serves every cached name — a 12-ingredient recipe used to cost 12
 * sequential round trips. Misses stay sequential so a cold recipe doesn't
 * burst the shared USDA DEMO_KEY. Keyed by the trimmed, lowercased name.
 */
export async function ingredientsPer100g(
  names: string[],
  { remote = true }: { remote?: boolean } = {},
): Promise<Map<string, Per100g | null>> {
  const norms = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, Per100g | null>();
  if (norms.length === 0) return out;

  const cached = await prisma.ingredientNutrition.findMany({ where: { name: { in: norms } } });
  // source NONE = USDA confirmed it has no such food; a known miss, not a gap.
  for (const c of cached) out.set(c.name, c.source === MISS_SOURCE ? null : c);

  for (const norm of norms) {
    if (out.has(norm)) continue;
    const fromStatic = staticLookup(norm);
    if (!fromStatic && !remote) {
      out.set(norm, null); // caller has its own fallback; don't wait on USDA
      continue;
    }
    const found = fromStatic ?? (await usdaLookup(norm));
    if (found === null) {
      out.set(norm, null); // transient failure — try again next time
      continue;
    }
    const data = found === 'miss' ? null : found;
    out.set(norm, data);
    await prisma.ingredientNutrition
      .upsert({
        where: { name: norm },
        update: {},
        create: {
          name: norm,
          ...(data ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }),
          source: data == null ? MISS_SOURCE : fromStatic ? 'STATIC' : 'USDA',
        },
      })
      .catch(() => {}); // cache write is best-effort
  }
  return out;
}

const per100Of = (map: Map<string, Per100g | null>, name: string) =>
  map.get(name.trim().toLowerCase()) ?? null;

export interface RecipeMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ItemMacros extends RecipeMacros {
  name: string;
  measure: string;
  grams: number;
  resolved: boolean;
}

/**
 * Macros for each typed item plus the sum. Unknown foods come back
 * `resolved: false` with zeros so the UI can say which ones it could not read.
 */
export async function macrosForItems(
  items: { name: string; measure: string }[],
  opts: { remote?: boolean } = {},
): Promise<{ items: ItemMacros[]; totals: RecipeMacros }> {
  const out: ItemMacros[] = [];
  const dishes = items.map((it) => dishFor(it.name));
  const lookup = await ingredientsPer100g(
    items.filter((_, i) => !dishes[i]).map((i) => i.name),
    opts,
  );
  for (const [i, it] of items.entries()) {
    const dish = dishes[i];
    // Someone logging "200g rice" or "1 bowl pasta" ate it cooked.
    const grams = dish ? dishMeasure(it.measure, dish).grams : measureToGrams(it.measure, it.name, 'cooked');
    const raw = dish ? null : per100Of(lookup, it.name);
    const per100 = dish ? dish.per100 : raw ? forState(it.name, it.measure, raw, 'cooked') : null;
    const f = per100 ? grams / 100 : 0;
    out.push({
      name: it.name,
      measure: it.measure,
      grams: Math.round(grams),
      resolved: per100 != null,
      calories: Math.round((per100?.calories ?? 0) * f),
      protein: Math.round((per100?.protein ?? 0) * f),
      carbs: Math.round((per100?.carbs ?? 0) * f),
      fat: Math.round((per100?.fat ?? 0) * f),
    });
  }
  const totals = out.reduce(
    (t, i) => ({
      calories: t.calories + i.calories,
      protein: t.protein + i.protein,
      carbs: t.carbs + i.carbs,
      fat: t.fat + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { items: out, totals };
}

export interface RecipeNutrition extends RecipeMacros {
  servings: number;
  servingGrams: number;
  /** How many ingredients had per-100g data. */
  resolved: number;
}

/**
 * Per-serving macros of a recipe from its ingredient lines and their per-100g
 * data. Pure: getOrComputeNutrition does the lookups and the caching.
 */
export function recipeNutrition(
  recipe: {
    name: string;
    category: string;
    instructions?: string;
    declaredServings?: number | null;
    ingredients: { name: string; measure: string }[];
  },
  lookup: Map<string, Per100g | null>,
): RecipeNutrition | null {
  const total: RecipeMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolved = 0;
  let totalGrams = 0;
  let water = 0;
  const lines = recipe.ingredients.map((ing) => ({
    ...ing,
    grams: eatenGrams(ing.name, measureToGrams(ing.measure, ing.name), recipe),
  }));
  for (const ing of lines) {
    const { grams } = ing;
    if (WATER.test(ing.name.trim().toLowerCase())) water += grams;
    else totalGrams += dishGrams(ing.name, ing.measure, grams);
    // Recipes list grains and pulses dry unless the line says "cooked".
    const raw = per100Of(lookup, ing.name);
    const per100 = raw ? forState(ing.name, ing.measure, raw, 'dry') : null;
    if (!per100) continue;
    resolved++;
    total.calories += (per100.calories * grams) / 100;
    total.protein += (per100.protein * grams) / 100;
    total.carbs += (per100.carbs * grams) / 100;
    total.fat += (per100.fat * grams) / 100;
  }
  if (resolved === 0) return null;
  // Unresolved ingredients would silently undercount — scale up assuming the
  // missing ones look like the average of the resolved ones (capped).
  const coverage = resolved / recipe.ingredients.length;
  const scale = 1 / Math.max(coverage, 0.6);
  totalGrams += Math.max(0, water - absorbedWater(lines)) * (1 - EVAPORATED);
  // A recipe that says how many it serves is believed over the weight estimate.
  const servings = recipe.declaredServings ?? estimateServings(totalGrams, recipe.category, recipe.name);
  return {
    calories: Math.round((total.calories * scale) / servings),
    protein: Math.round((total.protein * scale) / servings),
    carbs: Math.round((total.carbs * scale) / servings),
    fat: Math.round((total.fat * scale) / servings),
    servings,
    servingGrams: Math.round(totalGrams / servings),
    resolved,
  };
}

/**
 * Per-serving nutrition for a recipe. Lazily computed once, persisted on the
 * Recipe row, then served from there forever. Rows computed before servings
 * were estimated (servings null) were divided by a flat 4 and are recomputed.
 */
export async function getOrComputeNutrition(
  recipeId: string,
): Promise<(RecipeMacros & { servings: number; servingGrams: number | null }) | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });
  if (!recipe) return null;
  if (recipe.calories != null && recipe.servings != null) {
    return {
      calories: recipe.calories,
      protein: recipe.protein ?? 0,
      carbs: recipe.carbs ?? 0,
      fat: recipe.fat ?? 0,
      servings: recipe.servings,
      servingGrams: recipe.servingGrams,
    };
  }

  const lookup = await ingredientsPer100g(recipe.ingredients.map((i) => i.name));
  const computed = recipeNutrition(recipe, lookup);
  if (!computed) return null;
  const { servings, servingGrams, resolved, ...perServing } = computed;
  await prisma.recipe.update({ where: { id: recipeId }, data: { ...perServing, servings, servingGrams } });
  console.log(
    `[nutrition] ${recipe.name}: ${perServing.calories} cal/serving × ${servings} ` +
      `(${resolved}/${recipe.ingredients.length} ingredients resolved)`,
  );
  return { ...perServing, servings, servingGrams };
}
