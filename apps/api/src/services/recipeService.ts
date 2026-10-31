import type { Ingredient as IngredientModel, Recipe as RecipeModel } from '@prisma/client';
import { AIRecipeSchema, type Recipe, type SearchSource } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { extractJson } from '../lib/json.js';
import { searchMeals, randomMeals, mealsByArea, type ParsedMeal } from './mealdb.js';
import { aiComplete } from './ai/index.js';
import { getOrComputeNutrition } from './nutritionData.js';
import {
  RECIPE_SYSTEM,
  recipeUserPrompt,
  INSIGHTS_SYSTEM,
  insightsUserPrompt,
} from './ai/prompts.js';

type RecipeWithIngredients = RecipeModel & { ingredients: IngredientModel[] };

// AI models sometimes return country names instead of demonyms — normalize so
// the cuisine chips don't show both "India" and "Indian".
const CUISINE_ALIASES: Record<string, string> = {
  india: 'Indian', china: 'Chinese', france: 'French', italy: 'Italian',
  mexico: 'Mexican', japan: 'Japanese', thailand: 'Thai', spain: 'Spanish',
  greece: 'Greek', korea: 'Korean', vietnam: 'Vietnamese', turkey: 'Turkish',
  morocco: 'Moroccan', usa: 'American', 'united states': 'American', uk: 'British',
};

export function normalizeCuisine(cuisine: string): string {
  return CUISINE_ALIASES[cuisine.trim().toLowerCase()] ?? cuisine.trim();
}

// Regional labels stay on the recipe ("South Indian" on an idli is useful),
// but browse by the country: an "Indian" chip that skipped every South Indian,
// Punjabi and Maharashtrian recipe showed no tiffins at all.
const CUISINE_FAMILIES: Record<string, string[]> = {
  Indian: [
    'Indian', 'India', 'South Indian', 'North Indian', 'Punjabi', 'Maharashtrian', 'Hyderabadi',
    'Goan', 'Kashmiri', 'Bengali', 'Gujarati', 'Rajasthani', 'Kerala', 'Chettinad',
    'Tamil', 'Andhra', 'Karnataka', 'Udupi', 'Mughlai', 'Indo-Chinese',
  ],
};
const FAMILY_OF = new Map(
  Object.entries(CUISINE_FAMILIES).flatMap(([family, members]) => members.map((m) => [m, family])),
);

/** The browse chip a cuisine belongs under: "Punjabi" → "Indian". */
export function cuisineFamily(cuisine: string): string {
  return FAMILY_OF.get(cuisine) ?? cuisine;
}

/** Every stored cuisine label a browse chip covers. */
export function cuisineMembers(cuisine: string): string[] {
  return CUISINE_FAMILIES[cuisine] ?? [cuisine];
}

export function toDTO(r: RecipeWithIngredients): Recipe {
  return {
    id: r.id,
    externalId: r.externalId,
    name: r.name,
    category: r.category,
    cuisine: r.cuisine,
    imageUrl: r.imageUrl,
    instructions: r.instructions,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    source: r.source as Recipe['source'],
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    servings: r.servings,
    servingGrams: r.servingGrams,
    ingredients: [...r.ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ name: i.name, measure: i.measure, position: i.position })),
  };
}

/** Idempotent upsert of a TheMealDB meal (keyed on externalId). */
export async function upsertMeal(meal: ParsedMeal): Promise<RecipeWithIngredients> {
  const row = await prisma.recipe.upsert({
    where: { externalId: meal.externalId },
    update: {},
    create: {
      externalId: meal.externalId,
      name: meal.name,
      nameLower: meal.name.toLowerCase(),
      category: meal.category,
      cuisine: meal.cuisine,
      imageUrl: meal.imageUrl,
      instructions: meal.instructions,
      source: 'MEALDB',
      ingredients: { create: meal.ingredients },
    },
    include: { ingredients: true },
  });
  if (row.calories == null || row.servings == null) computeNutritionInBackground(row.id);
  return row;
}

// Best-effort: compute per-serving nutrition without blocking the request —
// USDA lookups can take seconds (per-call timeouts live in nutritionData), so
// the recipe row gets filled in asynchronously and served on later reads.
function computeNutritionInBackground(recipeId: string): void {
  void getOrComputeNutrition(recipeId).catch((err) =>
    console.warn('[nutrition] background compute failed:', (err as Error).message),
  );
}

export interface PageOpts {
  take: number;
  cursor?: string;
}

export async function search(
  q: string,
  page: PageOpts = { take: 20 },
): Promise<{ recipes: Recipe[]; source: SearchSource }> {
  const term = q.trim().toLowerCase();
  if (!term) return { recipes: [], source: 'none' };

  // 1. DB cache: name substring + exact SearchTerm mapping.
  const byName = await prisma.recipe.findMany({
    where: { nameLower: { contains: term } },
    include: { ingredients: true },
    orderBy: { id: 'asc' },
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  // The term→recipe mapping is a first-page extra, not part of the cursor
  // sequence: merging it into every page both broke the page size and made
  // the same recipe reappear after the cursor had already passed it.
  const mapped = page.cursor
    ? null
    : await prisma.searchTerm.findUnique({
        where: { term },
        include: { recipe: { include: { ingredients: true } } },
      });
  const cache = new Map<string, RecipeWithIngredients>();
  if (mapped) cache.set(mapped.recipe.id, mapped.recipe);
  for (const r of byName) cache.set(r.id, r);
  if (cache.size > 0) {
    return { recipes: [...cache.values()].slice(0, page.take).map(toDTO), source: 'cache' };
  }

  // 2. TheMealDB.
  try {
    const meals = await searchMeals(term);
    if (meals.length > 0) {
      const rows = await Promise.all(meals.map(upsertMeal));
      return { recipes: rows.map(toDTO), source: 'mealdb' };
    }
  } catch (err) {
    console.warn('[mealdb] search failed:', (err as Error).message);
  }

  // 3. AI generation.
  try {
    const { content, provider } = await aiComplete({
      system: RECIPE_SYSTEM,
      user: recipeUserPrompt(q.trim()),
      json: true,
    });
    const parsed = AIRecipeSchema.safeParse(extractJson(content));
    if (parsed.success) {
      const r = parsed.data;
      const created = await prisma.recipe.create({
        data: {
          name: r.name,
          nameLower: r.name.toLowerCase(),
          category: r.category,
          cuisine: normalizeCuisine(r.cuisine),
          imageUrl: null,
          instructions: r.instructions,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          source: 'AI',
          declaredServings: r.servings ?? null,
          ingredients: {
            create: r.ingredients.map((ing, position) => ({
              name: ing.name,
              measure: ing.measure,
              position,
            })),
          },
        },
        include: { ingredients: true },
      });
      computeNutritionInBackground(created.id);
      // Map the search term to the new recipe. term is globally unique, so
      // upsert instead of create (a second recipe for the same term reclaims
      // the mapping instead of crashing the whole generation).
      await prisma.searchTerm.upsert({
        where: { term },
        update: { recipeId: created.id },
        create: { term, recipeId: created.id },
      });
      console.log(`[ai] generated recipe for "${term}" via ${provider}`);
      return { recipes: [toDTO(created)], source: 'ai' };
    }
    console.warn(`[ai] response for "${term}" failed schema validation`);
  } catch (err) {
    console.warn('[ai] generation failed:', (err as Error).message);
  }

  // 4. Nothing worked — a normal "not found".
  return { recipes: [], source: 'none' };
}

/**
 * The whole library, paginated. Search needs a term and random caps at 10, so
 * the browse grid had nothing to list from.
 */
export async function browse(page: PageOpts = { take: 30 }): Promise<{ recipes: Recipe[] }> {
  const rows = await prisma.recipe.findMany({
    include: { ingredients: true },
    orderBy: { id: 'asc' }, // stable order so the cursor stays valid
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  return { recipes: rows.map(toDTO) };
}

export async function getRandom(count: number): Promise<Recipe[]> {
  try {
    const meals = await randomMeals(count);
    if (meals.length > 0) {
      const rows = await Promise.all(meals.map(upsertMeal));
      return rows.map(toDTO);
    }
  } catch (err) {
    console.warn('[mealdb] random failed:', (err as Error).message);
  }
  // Offline / demo fallback: serve seeded recipes from the DB. `orderBy
  // createdAt asc` returned the identical rows on every call, so a week's
  // auto-fill ended up as the same dish seven times.
  // ponytail: ORDER BY random() scans the table — fine for a recipe corpus of
  // this size; switch to a random-offset sample if it ever gets large.
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Recipe" ORDER BY random() LIMIT ${count}
  `;
  if (ids.length === 0) return [];
  const rows = await prisma.recipe.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: { ingredients: true },
  });
  return rows.map(toDTO);
}

// ponytail: per-process sync marker — re-syncs a cuisine once per API restart (upserts are cheap)
const syncedCuisines = new Set<string>();
// TheMealDB has ~30 real areas. The cap stops a stream of made-up names from
// growing the set, and the upstream traffic, without bound.
const MAX_SYNCED_CUISINES = 200;

/** All recipes for a cuisine; syncs the full set from TheMealDB into the DB first. */
export async function getByCuisine(
  cuisine: string,
  page: PageOpts = { take: 20 },
): Promise<Recipe[]> {
  if (!syncedCuisines.has(cuisine) && syncedCuisines.size < MAX_SYNCED_CUISINES) {
    // Claim it before awaiting: otherwise two concurrent requests for the same
    // cuisine both ran the full TheMealDB sync.
    syncedCuisines.add(cuisine);
    try {
      const meals = await mealsByArea(cuisine);
      // An empty result is a valid sync (TheMealDB lacks some cuisines, e.g. Indian).
      for (const meal of meals) await upsertMeal(meal);
    } catch (err) {
      syncedCuisines.delete(cuisine); // let the next request retry
      console.warn(`[mealdb] cuisine sync failed for "${cuisine}":`, (err as Error).message);
    }
  }
  const rows = await prisma.recipe.findMany({
    where: { cuisine: { in: cuisineMembers(cuisine) } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    include: { ingredients: true },
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  return rows.map(toDTO);
}

/** Cuisines available for browsing: what actually has recipes in the DB.
 *  (TheMealDB's area list has ~195 entries, most empty — not usable as chips.) */
export async function listCuisines(): Promise<string[]> {
  const db = await prisma.recipe.findMany({ select: { cuisine: true }, distinct: ['cuisine'] });
  const chips = db.map((r) => cuisineFamily(r.cuisine)).filter((c) => c && c !== 'Unknown');
  return [...new Set(chips)].sort();
}

export async function getById(id: string): Promise<Recipe | null> {
  const r = await prisma.recipe.findUnique({
    where: { id },
    include: { ingredients: true },
  });
  return r ? toDTO(r) : null;
}

/** Cached insight if present, else generate via the AI chain (throws if all fail). */
export async function getOrCreateInsights(
  recipeId: string,
): Promise<{ content: string; provider: string }> {
  const existing = await prisma.recipeInsight.findUnique({ where: { recipeId } });
  if (existing) return { content: existing.content, provider: existing.provider };

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });
  if (!recipe) throw new Error('recipe_not_found');

  const { content, provider } = await aiComplete({
    system: INSIGHTS_SYSTEM,
    user: insightsUserPrompt(
      recipe.name,
      recipe.ingredients.map((i) => i.name),
      recipe.instructions,
    ),
  });
  await prisma.recipeInsight.create({ data: { recipeId, content, provider } });
  return { content, provider };
}
