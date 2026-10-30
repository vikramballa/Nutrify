import type { FoodProduct } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Packaged food by barcode, from Open Food Facts: free, open data, no key.
 * Every hit is cached forever in FoodProduct, so OFF sees each barcode once
 * and a product scanned before keeps working when OFF is slow or down.
 * Misses are not cached — products are added to OFF all the time.
 */

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,product_name_en,generic_name,brands,nutriments,serving_quantity';
// OFF asks every client to identify itself instead of using a generic UA.
const USER_AGENT = 'NutriChef/2.0 (self-hosted nutrition app)';
const KJ_PER_KCAL = 4.184;
const MAX_SERVING_GRAMS = 2000;

/** OFF was unreachable — distinct from "no such product" so the client can retry. */
export class FoodLookupUnavailableError extends Error {}

export interface ParsedProduct {
  name: string;
  brand: string | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * OFF product JSON → per-100g macros. Null when the product has no usable
 * energy value: a product without calories would log as 0 kcal, which is
 * worse than asking the user to use another method.
 */
export function parseOffProduct(json: unknown): ParsedProduct | null {
  const product = (json as { product?: Record<string, unknown> } | null)?.product;
  if (!product) return null;
  const n = (product.nutriments ?? {}) as Record<string, unknown>;

  const kcal = num(n['energy-kcal_100g']);
  const kj = num(n['energy_100g']);
  const calories = kcal ?? (kj != null ? kj / KJ_PER_KCAL : null);
  if (calories == null) return null;

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const brand = text(product.brands)?.split(',')[0].trim() ?? null;
  const name =
    text(product.product_name) ?? text(product.product_name_en) ?? text(product.generic_name) ??
    brand ?? 'Scanned product';
  const serving = num(product.serving_quantity);

  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    name,
    brand,
    servingGrams: serving && serving <= MAX_SERVING_GRAMS ? serving : null,
    calories: round1(calories),
    protein: round1(num(n['proteins_100g']) ?? 0),
    carbs: round1(num(n['carbohydrates_100g']) ?? 0),
    fat: round1(num(n['fat_100g']) ?? 0),
  };
}

export function toFoodProductDTO(p: {
  barcode: string;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): FoodProduct {
  return {
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    servingGrams: p.servingGrams,
    per100g: { calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat },
  };
}

/** Cache → OFF. Null when OFF has no such product (or no calories for it). */
export async function lookupBarcode(barcode: string): Promise<FoodProduct | null> {
  const cached = await prisma.foodProduct.findUnique({ where: { barcode } });
  if (cached) return toFoodProductDTO(cached);

  let res: Response;
  try {
    res = await fetch(`${OFF_URL}/${barcode}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new FoodLookupUnavailableError((err as Error).message);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new FoodLookupUnavailableError(`OFF responded ${res.status}`);

  const parsed = parseOffProduct(await res.json());
  if (!parsed) return null;
  const row = await prisma.foodProduct.upsert({
    where: { barcode },
    update: {},
    create: { barcode, ...parsed },
  });
  return toFoodProductDTO(row);
}

/** Macros for `grams` of a product, rounded the way meal logs store them. */
export function macrosForGrams(p: FoodProduct, grams: number) {
  const f = grams / 100;
  return {
    calories: Math.round(p.per100g.calories * f),
    protein: Math.round(p.per100g.protein * f),
    carbs: Math.round(p.per100g.carbs * f),
    fat: Math.round(p.per100g.fat * f),
  };
}
