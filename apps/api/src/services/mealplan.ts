import type { MealPlanDay, MealPlanSlot } from '@nutrichef/shared';

/**
 * Pure date/totals/grocery math for the meal planner, kept DB-free so it can
 * be unit-tested without Postgres. Dates are handled as UTC midnights; the
 * wire format is the `YYYY-MM-DD` day key.
 */

/** Slots the auto-fill populates (snacks stay manual). */
export const AUTO_FILL_SLOTS: MealPlanSlot[] = ['breakfast', 'lunch', 'dinner'];

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a YYYY-MM-DD key into a UTC-midnight Date; null when malformed. */
export function parseDay(key: string): Date | null {
  const m = DAY_KEY.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Reject overflow dates like 2026-02-31.
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

/** Format a Date as its UTC YYYY-MM-DD day key. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday (UTC midnight) of the week containing `day`. */
export function weekStart(day: Date): Date {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d;
}

export interface WeekBounds {
  start: Date; // Monday, UTC midnight
  endExclusive: Date; // next Monday
  days: string[]; // 7 day keys, Monday..Sunday
}

/** Normalize any day key (or "now") to its Monday..Sunday week. */
export function weekBounds(week?: string, now = new Date()): WeekBounds | null {
  const day = week ? parseDay(week) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!day) return null;
  const start = weekStart(day);
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return dayKey(d);
  });
  return { start, endExclusive, days };
}

interface NutritionInput {
  date: string; // day key
  servings: number;
  recipe: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null } | null;
}

/** Per-day macro totals: recipe per-serving nutrition × servings; custom
 *  entries (recipe = null) contribute 0, as do recipes without nutrition. */
export function computeDayTotals(days: string[], entries: NutritionInput[]): MealPlanDay[] {
  const totals = new Map<string, MealPlanDay>(
    days.map((d) => [d, { date: d, calories: 0, protein: 0, carbs: 0, fat: 0 }]),
  );
  for (const e of entries) {
    const t = totals.get(e.date);
    if (!t || !e.recipe) continue;
    t.calories += (e.recipe.calories ?? 0) * e.servings;
    t.protein += (e.recipe.protein ?? 0) * e.servings;
    t.carbs += (e.recipe.carbs ?? 0) * e.servings;
    t.fat += (e.recipe.fat ?? 0) * e.servings;
  }
  return days.map((d) => totals.get(d)!);
}

/** Ingredient names not already on the grocery list. Case-insensitive dedupe
 *  both against the existing list and within the new names; first-seen
 *  casing wins. */
export function missingIngredientNames(existing: string[], needed: string[]): string[] {
  const seen = new Set(existing.map((n) => n.trim().toLowerCase()));
  const missing: string[] = [];
  for (const raw of needed) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    missing.push(name);
  }
  return missing;
}
