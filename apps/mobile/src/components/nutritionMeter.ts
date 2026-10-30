// Pure maths for the calorie ring and macro bars — no React, so it can be tested.

/** Fraction of a goal consumed, clamped to 0–1 (the ring never overdraws). */
export function progress(consumed: number, goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  const ratio = consumed / goal;
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  return Math.min(1, ratio);
}

/** Calories still available. Negative once the goal is passed. */
export function remaining(consumed: number, goal: number): number {
  return Math.round(goal - consumed);
}
