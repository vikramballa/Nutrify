import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateCustomLogSchema,
  LogBarcodeSchema,
  LogPreviewRequestSchema,
  MealTypeSchema,
  RepeatLogSchema,
} from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { getOrComputeNutrition, macrosForItems } from '../services/nutritionData.js';
import {
  FoodLookupUnavailableError,
  lookupBarcode,
  macrosForGrams,
} from '../services/foodProducts.js';
import { logEvent } from '../services/taste.js';
import { dayRange } from '../services/tracking.js';
import { computeStreak } from '../services/streak.js';
import { dayKey } from '../services/mealplan.js';
import { intParam } from '../lib/query.js';

const CreateLogSchema = z.object({
  recipeId: z.string(),
  mealType: MealTypeSchema,
  // Recipe nutrition is stored per serving; without this every log assumed
  // exactly one serving, so half a portion and a double helping were the
  // same number.
  servings: z.number().min(0.25).max(10).optional(),
});

/** Scale per-serving macros by the portion actually eaten. */
function scaleMacros(
  m: { calories: number; protein: number; carbs: number; fat: number },
  servings: number,
) {
  return {
    calories: Math.round(m.calories * servings),
    protein: Math.round(m.protein * servings),
    carbs: Math.round(m.carbs * servings),
    fat: Math.round(m.fat * servings),
  };
}

/** How many distinct days back the streak and recent-meal views look. */
const STREAK_LOOKBACK_DAYS = 400;
const RECENT_MEAL_DAYS = 30;
const RECENT_MEAL_COUNT = 8;
const REMINDER_SAMPLE_DAYS = 60;

/** Spreading the row would ship userId (and every future column) to the
 *  client; the DTO is an explicit whitelist instead. */
function toDTO(l: {
  id: string;
  recipeId: string | null;
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  at: Date;
}) {
  return {
    id: l.id,
    recipeId: l.recipeId,
    name: l.name,
    mealType: l.mealType,
    calories: l.calories,
    protein: l.protein,
    carbs: l.carbs,
    fat: l.fat,
    at: l.at.toISOString(),
  };
}

export async function logRoutes(app: FastifyInstance) {
  // Log "I ate this" — nutrition snapshotted per serving at log time.
  app.post('/logs', async (req, reply) => {
    const parsed = CreateLogSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_log' });
    const { recipeId, mealType } = parsed.data;

    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' });
    const macros = await getOrComputeNutrition(recipeId);
    if (!macros) return reply.code(422).send({ error: 'nutrition_unavailable' });

    logEvent(req.userId, 'log', { recipeId }); // eating it = strong taste signal
    const log = await prisma.mealLog.create({
      data: {
        userId: req.userId,
        recipeId,
        name: recipe.name,
        mealType,
        ...scaleMacros(macros, parsed.data.servings ?? 1),
      },
    });
    return toDTO(log);
  });

  // Log a custom meal — macros summed from the items the user typed
  // (rice 200g, chicken curry 300g). No serving division: they logged the
  // exact amounts they ate. Unresolvable items just contribute 0.
  // Unknown ingredients count 0 here; /logs/preview is where the user sees
  // which ones those are before saving.
  app.post('/logs/custom', async (req, reply) => {
    const parsed = CreateCustomLogSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_log' });
    const { name, mealType, items } = parsed.data;

    // The photo scanner already estimated macros from the picture, where a
    // sauce or a fried finish is visible; re-deriving them from item names
    // would throw that away. Anything else falls back to the ingredient math.
    const macros = parsed.data.macros ?? (await macrosForItems(items)).totals;

    const log = await prisma.mealLog.create({
      data: { userId: req.userId, recipeId: null, name, mealType, ...macros },
    });
    return toDTO(log);
  });

  /**
   * What a typed meal adds up to, per item, without logging it — so the user
   * sees "toast: not recognised" before saving instead of a silent 0.
   * USDA lookups are cached, but a first-time item still costs a request.
   */
  app.post(
    '/logs/preview',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = LogPreviewRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_items' });
      return macrosForItems(parsed.data.items);
    },
  );

  // Log a scanned packaged food. Macros come from the cached product, so the
  // client only chooses which product and how many grams.
  app.post('/logs/barcode', async (req, reply) => {
    const parsed = LogBarcodeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_log' });
    const { barcode, grams, mealType } = parsed.data;

    let product;
    try {
      product = await lookupBarcode(barcode);
    } catch (err) {
      if (err instanceof FoodLookupUnavailableError) {
        return reply.code(503).send({ error: 'lookup_unavailable' });
      }
      throw err;
    }
    if (!product) return reply.code(404).send({ error: 'product_not_found' });

    const log = await prisma.mealLog.create({
      data: {
        userId: req.userId,
        recipeId: null,
        name: product.name,
        mealType,
        ...macrosForGrams(product, grams),
      },
    });
    return toDTO(log);
  });

  // Today's meals + running totals (drives the Progress screen).
  app.get<{ Querystring: { take?: string; cursor?: string } }>('/logs/today', async (req) => {
    const take = intParam(req.query.take, 20, 50);
    // UTC midnight, matching /progress/summary, /water and /weight. A local
    // midnight here made today's totals disagree between Home and Progress.
    const { start, endExclusive } = dayRange(1);
    const logs = await prisma.mealLog.findMany({
      where: { userId: req.userId, at: { gte: start, lt: endExclusive } },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
      take,
      ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {}),
    });
    const totals = logs.reduce(
      (t, l) => ({
        calories: t.calories + l.calories,
        protein: t.protein + l.protein,
        carbs: t.carbs + l.carbs,
        fat: t.fat + l.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    return { logs: logs.map(toDTO), totals };
  });

  /**
   * Re-log something already eaten. Macros come from the stored row rather
   * than the request body, so the client cannot invent nutrition — it only
   * chooses which past meal and how much of it.
   */
  app.post('/logs/repeat', async (req, reply) => {
    const parsed = RepeatLogSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_log' });

    const source = await prisma.mealLog.findFirst({
      where: { id: parsed.data.logId, userId: req.userId },
    });
    if (!source) return reply.code(404).send({ error: 'not_found' });

    if (source.recipeId) logEvent(req.userId, 'log', { recipeId: source.recipeId });
    const log = await prisma.mealLog.create({
      data: {
        userId: req.userId,
        recipeId: source.recipeId,
        name: source.name,
        mealType: parsed.data.mealType ?? source.mealType,
        ...scaleMacros(source, parsed.data.servings ?? 1),
      },
    });
    return toDTO(log);
  });

  /** The handful of meals this user actually repeats, newest first. */
  app.get('/logs/recent', async (req) => {
    const since = new Date(Date.now() - RECENT_MEAL_DAYS * 86_400_000);
    // DISTINCT ON (name) — one row per dish, the most recent time it was eaten.
    const rows = await prisma.mealLog.findMany({
      where: { userId: req.userId, at: { gte: since } },
      distinct: ['name'],
      orderBy: [{ name: 'asc' }, { at: 'desc' }],
      take: 50,
    });
    const meals = rows
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, RECENT_MEAL_COUNT)
      .map((l) => ({
        logId: l.id,
        name: l.name,
        mealType: l.mealType,
        calories: l.calories,
        protein: l.protein,
        carbs: l.carbs,
        fat: l.fat,
        lastLoggedAt: l.at.toISOString(),
      }));
    return { meals };
  });

  /**
   * When this user actually eats, so the app can schedule reminders at their
   * real meal times instead of generic ones. Two columns, nothing sensitive.
   */
  app.get('/logs/times', async (req) => {
    const since = new Date(Date.now() - REMINDER_SAMPLE_DAYS * 86_400_000);
    const rows = await prisma.mealLog.findMany({
      where: { userId: req.userId, at: { gte: since } },
      select: { mealType: true, at: true },
      orderBy: { at: 'desc' },
      take: 400,
    });
    return { times: rows.map((r) => ({ mealType: r.mealType, at: r.at.toISOString() })) };
  });

  /** Logging streak. Distinct UTC days only — five meals in a day is one day. */
  app.get('/streak', async (req) => {
    const since = new Date(Date.now() - STREAK_LOOKBACK_DAYS * 86_400_000);
    const rows = await prisma.mealLog.findMany({
      where: { userId: req.userId, at: { gte: since } },
      select: { at: true },
      orderBy: { at: 'asc' },
    });
    return computeStreak(rows.map((r) => dayKey(r.at)));
  });

  app.delete<{ Params: { id: string } }>('/logs/:id', async (req, reply) => {
    const { count } = await prisma.mealLog.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    if (count === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
