import type { FastifyInstance } from 'fastify';
import { CreateMealPlanEntrySchema, type MealPlanEntry } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import * as recipes from '../services/recipeService.js';
import * as taste from '../services/taste.js';
import { groceryDTO } from './grocery.js';
import {
  AUTO_FILL_SLOTS,
  computeDayTotals,
  dayKey,
  missingIngredientNames,
  parseDay,
  weekBounds,
} from '../services/mealplan.js';

const RECIPE_SUMMARY_SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
  prepMinutes: true,
  cookMinutes: true,
} as const;

type EntryRow = {
  id: string;
  date: Date;
  slot: string;
  recipeId: string | null;
  customName: string | null;
  servings: number;
  recipe: {
    id: string;
    name: string;
    imageUrl: string | null;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
  } | null;
};

function toDTO(e: EntryRow): MealPlanEntry {
  const { recipe } = e;
  return {
    id: e.id,
    date: dayKey(e.date),
    slot: e.slot as MealPlanEntry['slot'],
    recipeId: e.recipeId,
    customName: e.customName,
    servings: e.servings,
    recipe: recipe
      ? {
          id: recipe.id,
          title: recipe.name,
          imageUrl: recipe.imageUrl,
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fat: recipe.fat,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
        }
      : null,
  };
}

/** Resolve and validate the ?week= query param into Monday..Sunday bounds. */
function resolveWeek(req: { query: unknown }): ReturnType<typeof weekBounds> {
  const week = (req.query as { week?: string }).week;
  return weekBounds(week);
}

async function weekEntries(userId: string, start: Date, endExclusive: Date): Promise<EntryRow[]> {
  return prisma.mealPlanEntry.findMany({
    where: { userId, date: { gte: start, lt: endExclusive } },
    include: { recipe: { select: RECIPE_SUMMARY_SELECT } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: 500,
  });
}

export async function mealPlanRoutes(app: FastifyInstance) {
  // The full week: entries with embedded recipe summaries + per-day totals.
  app.get('/meal-plan', async (req, reply) => {
    const bounds = resolveWeek(req);
    if (!bounds) return reply.code(400).send({ error: 'invalid_week' });
    const rows = await weekEntries(req.userId, bounds.start, bounds.endExclusive);
    const entries = rows.map(toDTO);
    return {
      weekStart: bounds.days[0],
      weekEnd: bounds.days[6],
      days: computeDayTotals(bounds.days, entries),
      entries,
    };
  });

  // Add one entry to a slot (recipe or free-text custom meal).
  app.post('/meal-plan', async (req, reply) => {
    const parsed = CreateMealPlanEntrySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_entry' });
    const { date, slot, recipeId, customName, servings } = parsed.data;

    const day = parseDay(date);
    if (!day) return reply.code(400).send({ error: 'invalid_date' });
    if (recipeId) {
      const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { id: true } });
      if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });
    }

    const entry = await prisma.mealPlanEntry.create({
      data: {
        userId: req.userId,
        date: day,
        slot,
        recipeId: recipeId ?? null,
        customName: customName ?? null,
        servings: servings ?? 1,
      },
      include: { recipe: { select: RECIPE_SUMMARY_SELECT } },
    });
    return toDTO(entry);
  });

  // Own entries only.
  app.delete<{ Params: { id: string } }>('/meal-plan/:id', async (req, reply) => {
    const { count } = await prisma.mealPlanEntry.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    if (count === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // Fill every empty breakfast/lunch/dinner slot of the week from the taste
  // engine's recommendations (random recipes as fallback/top-up).
  app.post('/meal-plan/auto-fill', async (req, reply) => {
    const bounds = resolveWeek(req);
    if (!bounds) return reply.code(400).send({ error: 'invalid_week' });
    const existing = await weekEntries(req.userId, bounds.start, bounds.endExclusive);
    const occupied = new Set(existing.map((e) => `${dayKey(e.date)}:${e.slot}`));

    const emptySlots: { date: string; slot: (typeof AUTO_FILL_SLOTS)[number] }[] = [];
    for (const date of bounds.days) {
      for (const slot of AUTO_FILL_SLOTS) {
        if (!occupied.has(`${date}:${slot}`)) emptySlots.push({ date, slot });
      }
    }
    if (emptySlots.length === 0) return { created: [] };

    // Recommendation pool, topped up with random recipes if the taste engine
    // returns fewer than needed (tiny recipe table). No repeats within a fill
    // unless the pool is exhausted.
    const rec = await taste.recommend(req.userId, emptySlots.length);
    const pool = [...rec.recipes];
    if (pool.length < emptySlots.length) {
      const seen = new Set(pool.map((r) => r.id));
      const extra = await recipes.getRandom(emptySlots.length - pool.length);
      for (const r of extra) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          pool.push(r);
        }
      }
    }

    const created: MealPlanEntry[] = [];
    for (let i = 0; i < emptySlots.length && pool.length > 0; i++) {
      const recipe = pool[i % pool.length];
      const entry = await prisma.mealPlanEntry.create({
        data: {
          userId: req.userId,
          date: parseDay(emptySlots[i].date)!,
          slot: emptySlots[i].slot,
          recipeId: recipe.id,
        },
        include: { recipe: { select: RECIPE_SUMMARY_SELECT } },
      });
      created.push(toDTO(entry));
    }
    return { created };
  });

  // Append the week's recipe ingredients to the grocery list, skipping names
  // already on it (case-insensitive).
  app.post('/meal-plan/to-grocery', async (req, reply) => {
    const bounds = resolveWeek(req);
    if (!bounds) return reply.code(400).send({ error: 'invalid_week' });
    const rows = await prisma.mealPlanEntry.findMany({
      where: { userId: req.userId, date: { gte: bounds.start, lt: bounds.endExclusive }, recipeId: { not: null } },
      select: { recipe: { select: { ingredients: { select: { name: true } } } } },
      take: 500,
    });
    const needed = rows.flatMap((r) => r.recipe?.ingredients.map((i) => i.name) ?? []);
    const existing = await prisma.groceryItem.findMany({
      where: { userId: req.userId },
      select: { name: true },
      take: 500,
    });
    const missing = missingIngredientNames(existing.map((i) => i.name), needed);
    if (missing.length > 0) {
      await prisma.groceryItem.createMany({
        data: missing.map((name) => ({ userId: req.userId, name })),
      });
    }
    const added = await prisma.groceryItem.findMany({
      where: { userId: req.userId, name: { in: missing } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      added: added.map(groceryDTO),
      skipped: new Set(needed.map((n) => n.trim().toLowerCase())).size - missing.length,
    };
  });
}
