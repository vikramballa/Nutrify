import {
  MealPhotoItemSchema,
  NutritionLabelAnalysisSchema,
  type MealPhotoItem,
  type NutritionLabelAnalysis,
  type SavedFood,
  type UsualDish,
} from '@nutrichef/shared';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { cleanDishName, correctionKey } from './mealCorrections.js';

/**
 * Per-user food memory: the portion of each scanned dish the user logged
 * last ("your usual"), and the labels and barcodes they log, so repeat meals
 * skip the camera or start at the right amount.
 *
 * Everything here is one user's own: nothing they log changes what another
 * user sees. Rows cascade with the user, so account deletion clears them.
 */

/** Saved foods returned for the label screen's quick-pick. */
export const SAVED_FOODS_SHOWN = 12;
/** Oldest foods/dishes beyond this per user are dropped. */
const MAX_PER_USER = 300;

type Macros = { calories: number; protein: number; carbs: number; fat: number };

const labelKey = (name: string) => `label:${correctionKey(name) || name.trim().toLowerCase()}`;
const barcodeKey = (code: string) => `barcode:${code}`;

// ---------------------------------------------------------------- dishes

/** Remember the portion of a scanned dish the user just logged. */
export async function rememberDish(
  userId: string,
  name: string,
  items: MealPhotoItem[],
  macros: Macros,
): Promise<void> {
  const dishKey = correctionKey(name);
  if (!dishKey || items.length === 0) return;
  const data = { name: cleanDishName(name) || name.slice(0, 80), items, ...macros };
  await prisma.userDish.upsert({
    where: { userId_dishKey: { userId, dishKey } },
    create: { userId, dishKey, ...data },
    update: { ...data, timesEaten: { increment: 1 }, lastEatenAt: new Date() },
  });
  await prune('dish', userId);
}

/** The user's last logged portion of this dish, if they have logged it. */
export async function usualDish(userId: string, name: string): Promise<UsualDish | null> {
  const dishKey = correctionKey(name);
  if (!dishKey) return null;
  const row = await prisma.userDish.findUnique({ where: { userId_dishKey: { userId, dishKey } } });
  if (!row) return null;
  const items = z.array(MealPhotoItemSchema).safeParse(row.items);
  if (!items.success) return null; // shape drifted: better no suggestion than a wrong one
  return {
    name: row.name,
    items: items.data,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    timesEaten: row.timesEaten,
    lastEatenAt: row.lastEatenAt.toISOString(),
  };
}

// ----------------------------------------------------------------- foods

/** Remember a label the user logged, and how much of it. */
export async function rememberLabel(
  userId: string,
  name: string,
  analysis: NutritionLabelAnalysis,
  amount: { grams?: number; servings?: number },
): Promise<void> {
  const foodKey = labelKey(name);
  const label = { ...analysis, productName: name };
  const usual = { usualGrams: amount.grams ?? null, usualServings: amount.servings ?? null };
  await prisma.userFood.upsert({
    where: { userId_foodKey: { userId, foodKey } },
    create: { userId, foodKey, name, label, ...usual },
    update: { name, label, ...usual, timesLogged: { increment: 1 }, lastLoggedAt: new Date() },
  });
  await prune('food', userId);
}

/** Remember how much of a barcode product the user had. */
export async function rememberBarcode(userId: string, barcode: string, name: string, grams: number): Promise<void> {
  const foodKey = barcodeKey(barcode);
  await prisma.userFood.upsert({
    where: { userId_foodKey: { userId, foodKey } },
    create: { userId, foodKey, name, barcode, usualGrams: grams },
    update: { name, usualGrams: grams, timesLogged: { increment: 1 }, lastLoggedAt: new Date() },
  });
  await prune('food', userId);
}

/** Grams of this product the user logged last time, or null. */
export async function usualGramsFor(userId: string, barcode: string): Promise<number | null> {
  const row = await prisma.userFood.findUnique({
    where: { userId_foodKey: { userId, foodKey: barcodeKey(barcode) } },
    select: { usualGrams: true },
  });
  return row?.usualGrams ?? null;
}

/** The user's saved labels, most recently logged first. */
export async function savedFoods(userId: string): Promise<SavedFood[]> {
  const rows = await prisma.userFood.findMany({
    where: { userId, foodKey: { startsWith: 'label:' } },
    orderBy: { lastLoggedAt: 'desc' },
    take: SAVED_FOODS_SHOWN,
  });
  const out: SavedFood[] = [];
  for (const r of rows) {
    const label = NutritionLabelAnalysisSchema.safeParse(r.label);
    if (!label.success) continue;
    out.push({
      id: r.id,
      name: r.name,
      label: label.data,
      usualGrams: r.usualGrams,
      usualServings: r.usualServings,
      timesLogged: r.timesLogged,
    });
  }
  return out;
}

export async function forgetFood(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.userFood.deleteMany({ where: { id, userId } });
  return count > 0;
}

// ----------------------------------------------------------------- shared

async function prune(kind: 'dish' | 'food', userId: string): Promise<void> {
  if (kind === 'dish') {
    const stale = await prisma.userDish.findMany({
      where: { userId },
      orderBy: { lastEatenAt: 'desc' },
      skip: MAX_PER_USER,
      select: { id: true },
    });
    if (stale.length) await prisma.userDish.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  } else {
    const stale = await prisma.userFood.findMany({
      where: { userId },
      orderBy: { lastLoggedAt: 'desc' },
      skip: MAX_PER_USER,
      select: { id: true },
    });
    if (stale.length) await prisma.userFood.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}
