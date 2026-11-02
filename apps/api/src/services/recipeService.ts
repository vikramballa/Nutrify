import { Prisma, type Ingredient as IngredientModel, type Recipe as RecipeModel } from '@prisma/client';
import { AIRecipeSchema, type Recipe, type RecipeShape, type SearchSource } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { TtlCache } from '../lib/ttlCache.js';
import { VISIBLE_RECIPE, VISIBLE_RECIPE_SQL } from './recipeQuality.js';
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

/**
 * A recipe card: every column a list shows, without instructions (long text
 * Postgres stores out of line) or the ingredient rows (10-15 per recipe).
 */
const CARD_SELECT = {
  id: true,
  externalId: true,
  name: true,
  category: true,
  cuisine: true,
  imageUrl: true,
  prepMinutes: true,
  cookMinutes: true,
  source: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
  servings: true,
  servingGrams: true,
} satisfies Prisma.RecipeSelect;
type RecipeCardRow = Prisma.RecipeGetPayload<{ select: typeof CARD_SELECT }>;

export function toCardDTO(r: RecipeCardRow): Recipe {
  return {
    ...r,
    source: r.source as Recipe['source'],
    instructions: '',
    ingredients: [],
    partial: true,
  };
}

/** Parse the list endpoints' `?fields=` query: `card` or the full recipe. */
export function shapeParam(fields: string | undefined): RecipeShape {
  return fields === 'card' ? 'card' : 'full';
}

type FindArgs = Omit<Prisma.RecipeFindManyArgs, 'select' | 'include'>;

/**
 * findMany for recipe lists in either shape. `full` is what every client got
 * before cards existed, and stays the default so installed app versions keep
 * working.
 */
export async function findRecipes(args: FindArgs, shape: RecipeShape = 'full'): Promise<Recipe[]> {
  if (shape === 'card') {
    return (await prisma.recipe.findMany({ ...args, select: CARD_SELECT })).map(toCardDTO);
  }
  return (await prisma.recipe.findMany({ ...args, include: { ingredients: true } })).map(toDTO);
}

/** Recipes by id in the order given (findMany returns them unordered). */
export async function recipesByIds(ids: string[], shape: RecipeShape = 'full'): Promise<Recipe[]> {
  if (ids.length === 0) return [];
  const rows = await findRecipes({ where: { id: { in: ids } } }, shape);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Recipe => !!r);
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
  shape: RecipeShape = 'full',
): Promise<{ recipes: Recipe[]; source: SearchSource }> {
  const term = q.trim().toLowerCase();
  if (!term) return { recipes: [], source: 'none' };

  // 1. DB cache: name substring + exact SearchTerm mapping.
  const byName = await findRecipes(
    {
      where: { nameLower: { contains: term }, ...VISIBLE_RECIPE },
      orderBy: { id: 'asc' },
      take: page.take,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    },
    shape,
  );
  // The term→recipe mapping is a first-page extra, not part of the cursor
  // sequence: merging it into every page both broke the page size and made
  // the same recipe reappear after the cursor had already passed it.
  const mapped = page.cursor
    ? null
    : await prisma.searchTerm.findUnique({ where: { term }, select: { recipeId: true } });
  const cache = new Map<string, Recipe>();
  // A mapping to a hidden (rejected) AI recipe is ignored, so the search
  // falls through and a new recipe takes the term over.
  if (mapped) {
    for (const r of await findRecipes({ where: { id: mapped.recipeId, ...VISIBLE_RECIPE } }, shape)) cache.set(r.id, r);
  }
  for (const r of byName) cache.set(r.id, r);
  if (cache.size > 0) {
    return { recipes: [...cache.values()].slice(0, page.take), source: 'cache' };
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

  // 3. A close spelling of a recipe we already have ("gongura chiken",
  //    "veg fried rice"). Generating would add a near-duplicate to the shared
  //    library and cost a model call; the term is mapped to the match so the
  //    next search for it is an exact hit.
  if (!page.cursor) {
    const similar = await similarRecipes(term, page.take, shape);
    if (similar.length > 0) {
      await prisma.searchTerm.upsert({
        where: { term },
        update: { recipeId: similar[0].id },
        create: { term, recipeId: similar[0].id },
      });
      return { recipes: similar, source: 'cache' };
    }
  }

  // 4. AI generation.
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

  // 5. Nothing worked — a normal "not found".
  return { recipes: [], source: 'none' };
}

/**
 * Trigram similarity at which two dish names are the same dish. Measured on
 * real pairs: typos and reworded names score 0.52-1.0 ("chiken biriyani",
 * "masla dosa", "veg fried rice"); different dishes 0.22-0.47 ("chicken
 * curry" vs "chicken biryani" 0.38). Erring low just means an AI recipe.
 */
export const SAME_DISH_SIMILARITY = 0.5;

/** Recipes whose name is a close spelling of `term`, closest first. */
export async function similarRecipes(term: string, take: number, shape: RecipeShape = 'full'): Promise<Recipe[]> {
  // `%` (similarity above pg_trgm's 0.3 default) can use the trigram GIN
  // index on nameLower; the explicit threshold then keeps only the close ones.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "Recipe" r
    WHERE r."nameLower" % ${term} AND similarity(r."nameLower", ${term}) >= ${SAME_DISH_SIMILARITY}
      AND ${Prisma.raw(VISIBLE_RECIPE_SQL)}
    ORDER BY similarity(r."nameLower", ${term}) DESC, r."id"
    LIMIT ${take}`;
  return recipesByIds(rows.map((r) => r.id), shape);
}

/**
 * The whole library, paginated. Search needs a term and random caps at 10, so
 * the browse grid had nothing to list from.
 */
export async function browse(
  page: PageOpts = { take: 30 },
  shape: RecipeShape = 'full',
): Promise<{ recipes: Recipe[] }> {
  const recipes = await findRecipes(
    {
      where: VISIBLE_RECIPE,
      orderBy: { id: 'asc' }, // stable order so the cursor stays valid
      take: page.take,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    },
    shape,
  );
  return { recipes };
}

export async function getRandom(count: number, shape: RecipeShape = 'full'): Promise<Recipe[]> {
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
    SELECT r.id FROM "Recipe" r WHERE ${Prisma.raw(VISIBLE_RECIPE_SQL)} ORDER BY random() LIMIT ${count}
  `;
  return recipesByIds(ids.map((r) => r.id), shape);
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
  shape: RecipeShape = 'full',
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
  return findRecipes(
    {
      where: { cuisine: { in: cuisineMembers(cuisine) }, ...VISIBLE_RECIPE },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: page.take,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    },
    shape,
  );
}

/** Cuisines available for browsing: what actually has recipes in the DB.
 *  (TheMealDB's area list has ~195 entries, most empty — not usable as chips.) */
export async function listCuisines(): Promise<string[]> {
  // The chips change only when recipes are imported; a minute's staleness is
  // invisible, and it saves a DISTINCT over the recipe table per screen open.
  return cuisineCache.getOrLoad('all', async () => {
    const db = await prisma.recipe.findMany({ select: { cuisine: true }, distinct: ['cuisine'] });
    const chips = db.map((r) => cuisineFamily(r.cuisine)).filter((c) => c && c !== 'Unknown');
    return [...new Set(chips)].sort();
  });
}
const cuisineCache = new TtlCache<'all', string[]>(60_000, 1);

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
