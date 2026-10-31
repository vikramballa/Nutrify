import { PrismaClient } from '@prisma/client';
import { INDIAN_RECIPES } from './indianRecipes.js';
import { INDIAN_PHOTOS } from './indianPhotos.js';
import { getOrComputeNutrition } from '../src/services/nutritionData.js';

const prisma = new PrismaClient();

// Idempotent: externalId "in-N" upserts, so re-running never duplicates.
// Ingredients are re-created each run to pick up recipe edits, and nutrition
// is cleared so it is recomputed from them. Photos are kept: a re-seed used to
// null every imageUrl, so the photo backfill re-picked them all.
async function main() {
  for (const [i, r] of INDIAN_RECIPES.entries()) {
    const externalId = `in-${i + 1}`;
    const data = {
      name: r.name,
      nameLower: r.name.toLowerCase(),
      category: r.category,
      cuisine: r.cuisine,
      instructions: r.instructions,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      source: 'MEALDB',
      declaredServings: r.servings,
      ingredients: {
        create: r.ingredients.map((ing, position) => ({ ...ing, position })),
      },
    };
    await prisma.recipe.upsert({
      where: { externalId },
      // On update, wipe old ingredients first so edits don't stack up.
      update: {
        ...data,
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        servings: null,
        servingGrams: null,
        ingredients: {
          deleteMany: {},
          create: r.ingredients.map((ing, position) => ({ ...ing, position })),
        },
      },
      create: { externalId, imageUrl: INDIAN_PHOTOS[r.name] ?? null, ...data },
    });
  }
  console.log(`Seeded ${INDIAN_RECIPES.length} Indian recipes (in-1 … in-${INDIAN_RECIPES.length}).`);

  // Best-effort per-serving nutrition for anything still missing it.
  const missing = await prisma.recipe.findMany({
    where: { calories: null },
    select: { id: true },
  });
  for (const r of missing) {
    try {
      await getOrComputeNutrition(r.id);
    } catch {
      // nutrition is best-effort; the backfill script can retry later
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
