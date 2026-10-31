import type { FastifyInstance } from 'fastify';
import {
  AnalyzeMealPhotoSchema,
  AnalyzeNutritionLabelSchema,
  CoachInsightSchema,
  MealPhotoAnalysisSchema,
  NutritionLabelAnalysisSchema,
  PantryIdeaSchema,
  PantryRequestSchema,
  computeGoals,
  macrosConsistent,
  type NutritionGoals,
} from '@nutrichef/shared';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { extractJson } from '../lib/json.js';
import { aiComplete } from '../services/ai/index.js';
import { sendAiError } from '../lib/aiErrors.js';
import { requireAiConsent } from '../lib/aiConsent.js';
import {
  COACH_SYSTEM,
  LABEL_SYSTEM,
  PANTRY_SYSTEM,
  VISION_SYSTEM,
  coachUserPrompt,
  labelUserPrompt,
  pantryUserPrompt,
  profileContext,
  visionUserPrompt,
} from '../services/ai/prompts.js';
import { adherenceScore, computeDailyTotals, dayRange } from '../services/tracking.js';
import { logEvent } from '../services/taste.js';
import { priceMealPhoto } from '../services/mealPhoto.js';

/** ~1.4 MB of base64 ≈ a 1 MB JPEG — above that the model call is not worth it. */
const MAX_IMAGE_CHARS = 1_400_000;
/** Photo routes only: room for MAX_IMAGE_CHARS plus slack, so an oversize
 *  image gets the readable image_too_large rather than a bare 413. */
const IMAGE_BODY_LIMIT = 2 * 1024 * 1024;

const COACH_DAYS = 7;

/** The user row every AI route here needs for `profileContext`. */
async function loadUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, include: { goals: true } });
}

/**
 * Ask the model for JSON and validate it against `schema`. One retry with a
 * blunter instruction, because a single stray sentence is the usual failure
 * and re-asking is cheaper than failing the request.
 */
async function aiJson<S extends z.ZodTypeAny>(
  schema: S,
  opts: { system: string; user: string; image?: string; maxTokens?: number },
): Promise<{ data: z.infer<S>; provider: string }> {
  let lastError = 'no attempt';
  for (const attempt of [0, 1]) {
    const { content, provider } = await aiComplete({
      system: opts.system,
      user:
        attempt === 0
          ? opts.user
          : `${opts.user}\n\nYour previous reply was not valid JSON. Output the JSON object only.`,
      json: true,
      maxTokens: opts.maxTokens ?? 1500,
      image: opts.image,
    });
    const parsed = schema.safeParse(extractJson(content));
    if (parsed.success) return { data: parsed.data, provider };
    lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  throw new Error(`ai_bad_shape: ${lastError}`);
}

// The model returns the coach insight without `score`/`provider` — those are
// ours to fill in, so they are stripped from the shape it is validated against.
const PantryModelSchema = z.object({ ideas: z.array(PantryIdeaSchema).min(1).max(5) });
const CoachModelSchema = CoachInsightSchema.omit({ score: true, provider: true });

export async function assistantRoutes(app: FastifyInstance) {
  /**
   * Meal photo → dish name + per-plate macros. Nothing is logged here: the app
   * shows the estimate, lets the user correct it, then posts to /logs/custom.
   * The model names the items and amounts; priceMealPhoto puts the numbers
   * through the nutrition tables wherever it recognises the item.
   */
  app.post<{ Body: { image?: string } }>(
    '/vision/meal',
    { bodyLimit: IMAGE_BODY_LIMIT, preHandler: requireAiConsent, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = AnalyzeMealPhotoSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_image' });
      if (parsed.data.image.length > MAX_IMAGE_CHARS) {
        return reply.code(413).send({ error: 'image_too_large' });
      }

      try {
        const { data, provider } = await aiJson(MealPhotoAnalysisSchema, {
          system: VISION_SYSTEM,
          user: visionUserPrompt(),
          image: parsed.data.image,
          maxTokens: 900,
        });
        // "Not a meal" is a valid answer from the model but a useless one to
        // hand the logging screen — say so plainly instead.
        if (data.confidence === 0 || data.calories === 0) {
          return reply.code(422).send({ error: 'not_a_meal' });
        }
        logEvent(req.userId, 'search', { term: data.name });
        return { ...(await priceMealPhoto(data)), provider };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );

  /**
   * Nutrition label photo → OCR'd per-serving macros straight off the panel.
   * Ground truth from the package, not a guess, so no confidence field and no
   * "not a meal" rejection — instead "No label found" means try again.
   */
  app.post<{ Body: { image?: string } }>(
    '/vision/label',
    { bodyLimit: IMAGE_BODY_LIMIT, preHandler: requireAiConsent, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = AnalyzeNutritionLabelSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_image' });
      if (parsed.data.image.length > MAX_IMAGE_CHARS) {
        return reply.code(413).send({ error: 'image_too_large' });
      }

      try {
        const { data, provider } = await aiJson(NutritionLabelAnalysisSchema, {
          system: LABEL_SYSTEM,
          user: labelUserPrompt(parsed.data.ocrText),
          image: parsed.data.image,
          maxTokens: 500,
        });
        if (!data.servingSize) {
          return reply.code(422).send({ error: 'no_label_found' });
        }
        logEvent(req.userId, 'search', { term: data.productName });
        // A misread digit shows up as energy that 4/4/9 can't explain.
        const note = macrosConsistent(data)
          ? data.note
          : 'These numbers do not add up — check them against the label before logging.';
        return { ...data, note, provider, source: 'ai' as const };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );

  /** Ingredients on hand → three dishes, easiest-to-cook first. */
  app.post(
    '/pantry/cook',
    { preHandler: requireAiConsent, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = PantryRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_pantry' });
      const ingredients = parsed.data.ingredients.map((i) => i.trim()).filter(Boolean);
      if (ingredients.length === 0) return reply.code(400).send({ error: 'invalid_pantry' });

      const user = await loadUser(req.userId);
      try {
        const { data, provider } = await aiJson(PantryModelSchema, {
          system: PANTRY_SYSTEM,
          user: pantryUserPrompt(ingredients, parsed.data.mealType, profileContext(user)),
          maxTokens: 1800,
        });
        for (const item of ingredients) logEvent(req.userId, 'search', { term: item });
        return { ideas: data.ideas, provider };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );

  /**
   * Weekly review of what was actually logged. The adherence score is computed
   * here rather than asked for — arithmetic is not what the model is for.
   */
  app.get(
    '/coach/weekly',
    { preHandler: requireAiConsent, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = await loadUser(req.userId);
      const range = dayRange(COACH_DAYS);
      const logs = await prisma.mealLog.findMany({
        where: { userId: req.userId, at: { gte: range.start, lt: range.endExclusive } },
        select: { at: true, name: true, calories: true, protein: true, carbs: true, fat: true },
        orderBy: { at: 'asc' },
        take: 1000,
      });
      if (logs.length === 0) return reply.code(422).send({ error: 'not_enough_data' });

      const days = computeDailyTotals(range.days, logs);
      const goals: NutritionGoals = user?.goals
        ? {
            calories: user.goals.calories,
            protein: user.goals.protein,
            carbs: user.goals.carbs,
            fat: user.goals.fat,
          }
        : // No questionnaire yet — fall back to the same defaults the profile
          // route would derive, so the coach still has a target to talk about.
          computeGoals({
            name: user?.name ?? 'there',
            age: 30,
            heightCm: 170,
            weightKg: 70,
            sex: 'male',
            activityLevel: 'moderate',
            goal: 'maintain',
            conditions: [],
          });

      // Distinct names keep the prompt short when a week has 20 logs.
      const meals = [...new Set(logs.map((l) => l.name))].slice(0, 20);

      try {
        const { data, provider } = await aiJson(CoachModelSchema, {
          system: COACH_SYSTEM,
          user: coachUserPrompt(profileContext(user), goals, days, meals),
          maxTokens: 1200,
        });
        return { ...data, score: adherenceScore(days, goals), provider };
      } catch (err) {
        return sendAiError(reply, err);
      }
    },
  );
}
