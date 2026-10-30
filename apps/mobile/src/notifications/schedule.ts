import type { MealType } from '@nutrichef/shared';

/**
 * Pure scheduling maths for the reminder system, kept free of Expo imports so
 * it can be unit-tested outside a device.
 *
 * The reminders are *learned*, not fixed. A person who eats breakfast at 10:30
 * gets nudged at 10:30, because a notification that lands at the wrong hour is
 * the fastest way to get notifications switched off for good.
 */

/** Fallbacks until there is enough history to learn from. */
const DEFAULT_HOURS: Record<MealType, number> = {
  breakfast: 8,
  lunch: 13,
  dinner: 20,
  snack: 16,
};

/** Meals that get a reminder. Snacks are not a habit worth nagging about. */
export const REMINDER_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];

/** Below this many samples a median is noise, so keep the default. */
const MIN_SAMPLES = 3;

export interface LogSample {
  mealType: string;
  /** Local hour-of-day, 0-23.99, when the meal was logged. */
  hour: number;
}

export interface Reminder {
  mealType: MealType;
  hour: number;
  minute: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A reminder per meal, at the median time that meal is actually logged.
 * Nudging happens slightly *before* the median, since the point is to catch
 * someone before they eat rather than to ask them to remember afterwards.
 */
export function learnReminders(samples: LogSample[], leadMinutes = 15): Reminder[] {
  return REMINDER_MEALS.map((mealType) => {
    const hours = samples.filter((s) => s.mealType === mealType).map((s) => s.hour);
    const centre = hours.length >= MIN_SAMPLES ? median(hours) : DEFAULT_HOURS[mealType];

    const totalMinutes = Math.round(centre * 60) - leadMinutes;
    // Clamp into the same day: a 00:05 breakfast must not wrap to 23:50.
    const clamped = Math.min(Math.max(totalMinutes, 0), 23 * 60 + 59);
    return { mealType, hour: Math.floor(clamped / 60), minute: clamped % 60 };
  });
}

const COPY: Record<MealType, { title: string; body: string }> = {
  // Encouraging, never scolding: guilt reliably makes people stop logging
  // rather than start eating better, and a user who stops logging is gone.
  breakfast: { title: 'Morning', body: 'What did breakfast look like? Takes ten seconds.' },
  lunch: { title: 'Lunch time', body: 'Snap your plate or tap a recent meal.' },
  dinner: { title: 'Dinner', body: 'Round the day off — log what you ate.' },
  snack: { title: 'Snack', body: 'Log it so today stays accurate.' },
};

export function reminderCopy(mealType: MealType): { title: string; body: string } {
  return COPY[mealType];
}

/** Sunday evening, when the weekly coach review has a full week to talk about. */
export const COACH_WEEKDAY = 1; // expo-notifications: 1 = Sunday
export const COACH_HOUR = 18;
