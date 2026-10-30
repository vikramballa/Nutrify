// Bulk-import the full TheMealDB catalog (every cuisine, full ingredients +
// instructions) into the DB. Idempotent — upserts on externalId. Needs network.
// Run: npm run db:import
import { prisma } from '../src/lib/prisma.js';
import { listAreas, mealsByArea } from '../src/services/mealdb.js';
import { upsertMeal } from '../src/services/recipeService.js';

async function main() {
  const areas = await listAreas();
  let total = 0;
  for (const area of areas) {
    const meals = await mealsByArea(area);
    for (const meal of meals) await upsertMeal(meal);
    total += meals.length;
    // Most of TheMealDB's ~195 listed areas have zero meals — only log hits.
    if (meals.length > 0) console.log(`  ${area}: ${meals.length} recipes`);
  }
  console.log(`Imported ${total} recipes across ${areas.length} cuisines.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
