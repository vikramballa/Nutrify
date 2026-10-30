import { getOrComputeNutrition } from '../src/services/nutritionData.js';
import { prisma } from '../src/lib/prisma.js';

/**
 * Backfill per-serving nutrition (calories/protein/carbs/fat) for recipes that
 * predate the nutrition columns, or that were divided by the old flat 4
 * servings (servings null). Idempotent: getOrComputeNutrition skips rows that
 * already have both. USDA lookups are cached in IngredientNutrition,
 * so re-runs only pay for newly seen ingredients.
 *
 *   npm run db:backfill-nutrition -w apps/api
 */
async function main() {
  const missing = await prisma.recipe.findMany({
    where: { OR: [{ calories: null }, { servings: null }] },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`[backfill] ${missing.length} recipes missing nutrition`);

  let computed = 0;
  const failed: string[] = [];
  for (const r of missing) {
    try {
      const res = await getOrComputeNutrition(r.id);
      if (res) computed++;
      else failed.push(r.name);
    } catch (err) {
      failed.push(`${r.name} (${(err as Error).message})`);
    }
  }

  console.log(`[backfill] computed nutrition for ${computed}/${missing.length} recipes`);
  if (failed.length > 0) {
    console.log(`[backfill] ${failed.length} recipes could not be resolved:`);
    for (const name of failed) console.log(`  - ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
