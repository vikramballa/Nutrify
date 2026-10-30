import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ProfileInputSchema,
  computeMetrics,
  computeGoals,
  type ProfileInput,
  type ProfileResponse,
} from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import type { User, NutritionGoals } from '@prisma/client';
import { computeAdaptiveGoals, WINDOW_DAYS } from '../services/adaptive.js';
import { computeDailyTotals, dayRange } from '../services/tracking.js';
import { dayKey } from '../services/mealplan.js';

function profileOf(user: User): ProfileInput | null {
  if (!user.onboarded || user.age == null || user.heightCm == null || user.weightKg == null) {
    return null;
  }
  return ProfileInputSchema.parse({
    name: user.name,
    age: user.age,
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    sex: user.sex,
    activityLevel: user.activityLevel,
    goal: user.goal,
    conditions: user.conditions,
  });
}

const goalsOf = (g: NutritionGoals) => ({
  calories: g.calories,
  carbs: g.carbs,
  protein: g.protein,
  fat: g.fat,
});

function toResponse(user: User, goals: NutritionGoals): ProfileResponse {
  const profile = profileOf(user);
  return {
    name: user.name,
    onboarded: user.onboarded,
    profile,
    metrics: profile ? computeMetrics(profile) : null,
    goals: goalsOf(goals),
  };
}

/** Adaptive-goals verdict for a user, or null when onboarding is unfinished. */
async function adaptiveFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { goals: true } });
  const profile = user ? profileOf(user) : null;
  if (!user || !profile || !user.goals) return null;

  const range = dayRange(WINDOW_DAYS);
  const window = { gte: range.start, lt: range.endExclusive };
  const [logs, weights] = await Promise.all([
    prisma.mealLog.findMany({
      where: { userId, at: window },
      select: { at: true, calories: true, protein: true, carbs: true, fat: true },
      take: 5000,
    }),
    prisma.weightEntry.findMany({
      where: { userId, date: window },
      select: { date: true, kg: true },
      take: 500,
    }),
  ]);
  return {
    user,
    result: computeAdaptiveGoals({
      profile,
      current: goalsOf(user.goals),
      days: computeDailyTotals(range.days, logs),
      weights: weights.map((w) => ({ date: dayKey(w.date), kg: w.kg })),
    }),
  };
}

const AiConsentSchema = z.object({ granted: z.boolean() });

export async function profileRoutes(app: FastifyInstance) {
  // Grant or revoke permission to send personal data to the AI provider.
  app.put('/profile/ai-consent', async (req, reply) => {
    const parsed = AiConsentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_consent' });
    await prisma.user.update({
      where: { id: req.userId },
      data: { aiConsentAt: parsed.data.granted ? new Date() : null },
    });
    return { aiConsent: parsed.data.granted };
  });

  app.get('/profile', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { goals: true },
    });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const goals =
      user.goals ??
      (await prisma.nutritionGoals.create({ data: { userId: req.userId } }));
    return toResponse(user, goals);
  });

  // Onboarding answers / settings edits: store them and recompute goals.
  app.put('/profile', async (req, reply) => {
    const parsed = ProfileInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_profile', details: parsed.error.flatten() });
    }
    const p = parsed.data;
    const goals = computeGoals(p);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        name: p.name,
        age: p.age,
        heightCm: p.heightCm,
        weightKg: p.weightKg,
        sex: p.sex,
        activityLevel: p.activityLevel,
        goal: p.goal,
        conditions: p.conditions,
        onboarded: true,
        goals: {
          upsert: { create: goals, update: goals },
        },
      },
      include: { goals: true },
    });
    return toResponse(user, user.goals!);
  });

  // Targets recalibrated from measured intake vs weight trend. Read-only: the
  // user sees the suggestion and chooses to apply it.
  app.get('/goals/adaptive', async (req, reply) => {
    const adaptive = await adaptiveFor(req.userId);
    if (!adaptive) return reply.code(409).send({ error: 'profile_incomplete' });
    return adaptive.result;
  });

  // Recomputed here rather than accepted from the body — goals, like macros,
  // are server-authoritative. Editing the profile later resets to the formula.
  app.post('/goals/adaptive/apply', async (req, reply) => {
    const adaptive = await adaptiveFor(req.userId);
    if (!adaptive) return reply.code(409).send({ error: 'profile_incomplete' });
    if (adaptive.result.status !== 'ready') return reply.code(409).send({ error: 'not_ready' });
    const goals = await prisma.nutritionGoals.update({
      where: { userId: req.userId },
      data: adaptive.result.suggested,
    });
    return toResponse(adaptive.user, goals);
  });
}
