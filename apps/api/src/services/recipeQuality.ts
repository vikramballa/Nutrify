import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Recipe quality from behaviour, not from asking. Per recipe:
 *
 *   qualityScore = users who saved, logged, planned or 👍 it
 *                − 2 × users who said "not for me" (last 90 days of events)
 *
 * Each person counts once per side, so one user can't push a recipe up or
 * down on their own. Recomputed daily by the retention sweep.
 *
 * AI recipes scoring below HIDE_AI_BELOW (e.g. two people rejected it and
 * nobody kept it) leave search, browse, cuisine pages, recommendations and
 * random picks. A search that used to map to one then generates a fresh
 * recipe, which takes the search term over. Direct links, favourites and
 * past logs still open it.
 */
export const HIDE_AI_BELOW = -3;

/** `where` for every list that should skip rejected AI recipes. */
export const VISIBLE_RECIPE: Prisma.RecipeWhereInput = {
  NOT: { source: 'AI', qualityScore: { lt: HIDE_AI_BELOW } },
};

/** The same rule for raw SQL on "Recipe" (alias r). */
export const VISIBLE_RECIPE_SQL = `NOT (r."source" = 'AI' AND r."qualityScore" < ${HIDE_AI_BELOW})`;

/** Recompute every recipe's score; touches only rows whose score changed. */
export async function recomputeRecipeQuality(): Promise<number> {
  return prisma.$executeRaw`
    WITH positive AS (
      SELECT "recipeId", count(DISTINCT "userId") AS n FROM (
        SELECT "recipeId", "userId" FROM "Favorite"
        UNION ALL SELECT "recipeId", "userId" FROM "MealLog" WHERE "recipeId" IS NOT NULL
        UNION ALL SELECT "recipeId", "userId" FROM "MealPlanEntry" WHERE "recipeId" IS NOT NULL
        UNION ALL SELECT "recipeId", "userId" FROM "UserEvent" WHERE "type" = 'like' AND "recipeId" IS NOT NULL
      ) kept GROUP BY "recipeId"
    ),
    negative AS (
      SELECT "recipeId", count(DISTINCT "userId") AS n
      FROM "UserEvent" WHERE "type" = 'dislike' AND "recipeId" IS NOT NULL
      GROUP BY "recipeId"
    ),
    scored AS (
      SELECT r."id", (coalesce(p.n, 0) - 2 * coalesce(d.n, 0))::int AS score
      FROM "Recipe" r
      LEFT JOIN positive p ON p."recipeId" = r."id"
      LEFT JOIN negative d ON d."recipeId" = r."id"
    )
    UPDATE "Recipe" r SET "qualityScore" = s.score
    FROM scored s
    WHERE r."id" = s."id" AND r."qualityScore" IS DISTINCT FROM s.score`;
}
