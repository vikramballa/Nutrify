import {
  MealPhotoItemSchema,
  NutritionLabelAnalysisSchema,
  type MealPhotoItem,
  type NutritionLabelAnalysis,
  type SavedFood,
  type UsualDish,
} from '@nutrichef/shared';
import type { FoodProduct } from '@nutrichef/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { FoodLookupUnavailableError, lookupBarcode } from './foodProducts.js';
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

/** Stop offering a dish's usual portion (the next log starts it afresh). */
export async function forgetDish(userId: string, name: string): Promise<boolean> {
  const dishKey = correctionKey(name);
  if (!dishKey) return false;
  const { count } = await prisma.userDish.deleteMany({ where: { userId, dishKey } });
  return count > 0;
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

/**
 * Remember a label the user logged, and how much of it. With `barcode` (the
 * pack's code, when Open Food Facts didn't know it) the label is stored
 * against that barcode, so this user's next scan of it finds the product.
 */
export async function rememberLabel(
  userId: string,
  name: string,
  analysis: NutritionLabelAnalysis,
  amount: { grams?: number; servings?: number; barcode?: string },
): Promise<void> {
  const foodKey = amount.barcode ? barcodeKey(amount.barcode) : labelKey(name);
  const label = { ...analysis, productName: name };
  const usual = { usualGrams: amount.grams ?? null, usualServings: amount.servings ?? null };
  const barcode = amount.barcode ?? null;
  await prisma.userFood.upsert({
    where: { userId_foodKey: { userId, foodKey } },
    create: { userId, foodKey, name, barcode, label, ...usual },
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
    // Every food with a label kept: plain labels and labels linked to a barcode.
    where: { userId, label: { not: Prisma.DbNull } },
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
      barcode: r.barcode,
      usualGrams: r.usualGrams,
      usualServings: r.usualServings,
      timesLogged: r.timesLogged,
    });
  }
  return out;
}

/**
 * A barcode product built from the label this user scanned for it, for a
 * barcode Open Food Facts doesn't know. Needs grams-based numbers: the label's
 * per-100 g column, or per-serving numbers with the serving's weight.
 */
export async function productFromUserLabel(userId: string, barcode: string): Promise<FoodProduct | null> {
  const row = await prisma.userFood.findUnique({
    where: { userId_foodKey: { userId, foodKey: barcodeKey(barcode) } },
  });
  const label = NutritionLabelAnalysisSchema.safeParse(row?.label);
  if (!row || !label.success) return null;
  const per100g = per100FromLabel(label.data);
  if (!per100g) return null;
  return {
    barcode,
    name: row.name,
    brand: null,
    servingGrams: label.data.servingGrams ?? null,
    per100g,
    usualGrams: row.usualGrams,
  };
}

/**
 * The product behind a barcode for this user: the shared Open Food Facts
 * cache first, else the label they scanned for it. Their own label also
 * stands in when OFF is unreachable. Includes their usual grams.
 */
export async function productForUser(userId: string, barcode: string): Promise<FoodProduct | null> {
  try {
    const shared = await lookupBarcode(barcode);
    if (shared) return { ...shared, usualGrams: await usualGramsFor(userId, barcode) };
  } catch (err) {
    if (!(err instanceof FoodLookupUnavailableError)) throw err;
    const own = await productFromUserLabel(userId, barcode);
    if (own) return own;
    throw err;
  }
  return productFromUserLabel(userId, barcode);
}

/** Per-100 g macros from a label, if it gives enough to work them out. */
export function per100FromLabel(l: NutritionLabelAnalysis): FoodProduct['per100g'] | null {
  if (l.per100g) return l.per100g;
  if (!l.servingGrams) return null;
  const f = 100 / l.servingGrams;
  const r1 = (n: number) => Math.round(n * f * 10) / 10;
  return { calories: r1(l.calories), protein: r1(l.protein), carbs: r1(l.carbs), fat: r1(l.fat) };
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
