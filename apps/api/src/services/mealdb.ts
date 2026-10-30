import { fetchWithTimeout } from '../lib/http.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';
const TIMEOUT_MS = 8_000;

export interface ParsedMeal {
  externalId: string;
  name: string;
  category: string;
  cuisine: string;
  imageUrl: string | null;
  instructions: string;
  ingredients: { name: string; measure: string; position: number }[];
}

interface RawMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strMealThumb?: string | null;
  strInstructions?: string | null;
  [key: string]: string | null | undefined;
}

function parse(meal: RawMeal): ParsedMeal {
  const ingredients: ParsedMeal['ingredients'] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? '').toString().trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${i}`] ?? '').toString().trim();
    ingredients.push({ name, measure, position: ingredients.length });
  }
  return {
    externalId: meal.idMeal,
    // TheMealDB ships some names with leading spaces (" Bubble & Squeak").
    name: meal.strMeal.trim(),
    category: meal.strCategory?.trim() || 'Uncategorized',
    cuisine: meal.strArea?.trim() || 'Unknown',
    imageUrl: meal.strMealThumb?.trim() || null,
    instructions: meal.strInstructions?.trim() || '',
    ingredients,
  };
}

async function get(path: string): Promise<RawMeal[]> {
  const res = await fetchWithTimeout(`${BASE}/${path}`, {}, TIMEOUT_MS);
  if (!res.ok) throw new Error(`mealdb HTTP ${res.status}`);
  const data = (await res.json()) as { meals: RawMeal[] | null };
  return data.meals ?? [];
}

export async function searchMeals(term: string): Promise<ParsedMeal[]> {
  const meals = await get(`search.php?s=${encodeURIComponent(term)}`);
  return meals.map(parse);
}

/** All cuisines (areas) TheMealDB knows about. */
export async function listAreas(): Promise<string[]> {
  const res = await fetchWithTimeout(`${BASE}/list.php?a=list`, {}, TIMEOUT_MS);
  if (!res.ok) throw new Error(`mealdb HTTP ${res.status}`);
  const data = (await res.json()) as { meals: { strArea: string }[] | null };
  return (data.meals ?? []).map((m) => m.strArea).filter(Boolean);
}

/** Full meals (ingredients + instructions) for a cuisine, via filter + lookup. */
export async function mealsByArea(area: string): Promise<ParsedMeal[]> {
  const stubs = await get(`filter.php?a=${encodeURIComponent(area)}`);
  const full = await Promise.all(
    stubs.map((s) =>
      get(`lookup.php?i=${s.idMeal}`)
        .then((m) => m[0] ?? null)
        .catch(() => null),
    ),
  );
  return full.filter((m): m is RawMeal => m !== null).map(parse);
}

export async function randomMeals(count: number): Promise<ParsedMeal[]> {
  // random.php returns one meal per call; over-fetch a little to dedupe.
  // Sequentially these were up to count*2 round trips at an 8s timeout each,
  // so a single /recipes/random could stall for minutes on a slow upstream.
  const results = await Promise.all(
    Array.from({ length: count * 2 }, () =>
      get('random.php')
        .then((m) => (m[0] ? parse(m[0]) : null))
        .catch(() => null),
    ),
  );
  const seen = new Set<string>();
  const out: ParsedMeal[] = [];
  for (const parsed of results) {
    if (!parsed || seen.has(parsed.externalId)) continue;
    seen.add(parsed.externalId);
    out.push(parsed);
    if (out.length === count) break;
  }
  return out;
}
