import {
  GOAL_CALORIE_DELTA,
  computeMetrics,
  goalsForCalories,
  type AdaptiveGoalsResponse,
  type NutritionGoals,
  type ProfileInput,
  type ProgressDay,
} from '@nutrichef/shared';
import { parseDay } from './mealplan.js';

/**
 * Adaptive goals: measure what this user's body actually burns from what they
 * ate and what the scale did, instead of trusting the Mifflin-St Jeor guess.
 *
 *   energy balance:  intake − TDEE = Δweight × 7700 kcal/kg
 *   so               TDEE = mean intake − (kg/day slope × 7700)
 *
 * Pure and DB-free like the other date maths; the route feeds it rows.
 */

export const WINDOW_DAYS = 28;
export const REQUIRED_LOGGED_DAYS = 10;
export const REQUIRED_WEIGH_INS = 3;
export const REQUIRED_SPAN_DAYS = 10;

const KCAL_PER_KG = 7700;
// A day logged under half the current target is almost always a day the
// user stopped logging, not a day they ate 600 kcal. Counting it would drag
// measured TDEE down and push the target lower every week.
const COMPLETE_DAY_FRACTION = 0.5;
// Water weight and logging error can swing a 4-week estimate wildly; the
// formula is a sane prior the measurement may move away from, not escape.
const TDEE_CLAMP = 0.25;
// One recalibration moves the target at most this far, so a noisy fortnight
// nudges rather than lurches.
const MAX_STEP_KCAL = 300;
const NOISE_KCAL = 50;
const NOISE_PROTEIN_G = 5;

export interface WeighIn {
  date: string; // YYYY-MM-DD
  kg: number;
}

const DAY_MS = 86_400_000;
const dayIndex = (key: string) => parseDay(key)!.getTime() / DAY_MS;

/** Least-squares slope of weight over time, kg per day. 0 with <2 points. */
export function weightSlopeKgPerDay(entries: WeighIn[]): number {
  if (entries.length < 2) return 0;
  const xs = entries.map((e) => dayIndex(e.date));
  const ys = entries.map((e) => e.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function computeAdaptiveGoals(input: {
  profile: ProfileInput;
  current: NutritionGoals;
  days: ProgressDay[]; // per-day intake over the window
  weights: WeighIn[]; // weigh-ins over the window, any order
}): AdaptiveGoalsResponse {
  const { profile, current } = input;
  const logged = input.days.filter((d) => d.calories >= current.calories * COMPLETE_DAY_FRACTION);
  const weights = [...input.weights].sort((a, b) => a.date.localeCompare(b.date));
  const span =
    weights.length >= 2 ? dayIndex(weights[weights.length - 1].date) - dayIndex(weights[0].date) : 0;

  if (
    logged.length < REQUIRED_LOGGED_DAYS ||
    weights.length < REQUIRED_WEIGH_INS ||
    span < REQUIRED_SPAN_DAYS
  ) {
    return {
      status: 'collecting',
      windowDays: WINDOW_DAYS,
      loggedDays: logged.length,
      requiredLoggedDays: REQUIRED_LOGGED_DAYS,
      weighIns: weights.length,
      requiredWeighIns: REQUIRED_WEIGH_INS,
      weighInSpanDays: Math.round(span),
      requiredSpanDays: REQUIRED_SPAN_DAYS,
    };
  }

  // Protein is per kg, so it should follow the scale, not the onboarding weight.
  const latestKg = Math.min(300, Math.max(30, weights[weights.length - 1].kg));
  const now: ProfileInput = { ...profile, weightKg: latestKg };

  const avgIntake = logged.reduce((t, d) => t + d.calories, 0) / logged.length;
  const slope = weightSlopeKgPerDay(weights);
  const formulaTdee = computeMetrics(now).tdee;
  const measured = avgIntake - slope * KCAL_PER_KG;
  const estimatedTdee = Math.min(
    formulaTdee * (1 + TDEE_CLAMP),
    Math.max(formulaTdee * (1 - TDEE_CLAMP), measured),
  );

  const ideal = estimatedTdee + GOAL_CALORIE_DELTA[profile.goal];
  const step = Math.min(MAX_STEP_KCAL, Math.max(-MAX_STEP_KCAL, ideal - current.calories));
  const suggested = goalsForCalories(now, current.calories + step);

  return {
    status: 'ready',
    windowDays: WINDOW_DAYS,
    loggedDays: logged.length,
    weighIns: weights.length,
    avgIntake: Math.round(avgIntake),
    weeklyChangeKg: Math.round(slope * 7 * 100) / 100,
    formulaTdee: Math.round(formulaTdee),
    estimatedTdee: Math.round(estimatedTdee),
    current,
    suggested,
    changed:
      Math.abs(suggested.calories - current.calories) >= NOISE_KCAL ||
      Math.abs(suggested.protein - current.protein) >= NOISE_PROTEIN_G,
  };
}
