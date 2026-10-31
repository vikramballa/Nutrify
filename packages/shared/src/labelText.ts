// ---------------------------------------------------------------------------
// Nutrition label text → macros. Pure, so the phone can read a label from
// on-device OCR with no network, no model and no AI consent; the vision model
// is only the fallback when this can't make sense of the text.
//
// Handles US "Nutrition Facts" panels (per serving) and Indian FSSAI panels,
// which usually print per 100 g, often beside a per-serve column, with energy
// in kcal, kJ or both.
// ---------------------------------------------------------------------------

/** One recognised text box. Coordinates are 0-1 of the image, y from the top. */
export interface OcrBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ParsedLabel {
  per100g: LabelMacros | null;
  perServing: LabelMacros | null;
  servingGrams: number | null;
  servingSize: string | null;
  servingsPerContainer: number | null;
  packGrams: number | null;
}

/**
 * Rebuild visual rows from OCR boxes. A table's label and its numbers come
 * back as separate boxes ("Protein (g)" | "6.8" | "2.0"); rows are rebuilt by
 * vertical overlap, then read left to right.
 */
export function ocrRows(boxes: OcrBox[]): string[] {
  const sorted = boxes
    .filter((b) => b.text.trim())
    .map((b) => ({ ...b, cy: b.y + b.h / 2 }))
    .sort((a, b) => a.cy - b.cy);
  const rows: { cy: number; h: number; boxes: typeof sorted }[] = [];
  for (const b of sorted) {
    const row = rows[rows.length - 1];
    // Within half a line height counts as the same line; a slightly tilted
    // photo still keeps a row together.
    if (row && Math.abs(b.cy - row.cy) < Math.min(row.h, b.h) * 0.6) {
      row.boxes.push(b);
      row.cy = (row.cy * (row.boxes.length - 1) + b.cy) / row.boxes.length;
      row.h = Math.max(row.h, b.h);
    } else {
      rows.push({ cy: b.cy, h: b.h, boxes: [b] });
    }
  }
  return rows.map((r) =>
    r.boxes
      .sort((a, b) => a.x - b.x)
      .map((b) => b.text.trim())
      .join(' '),
  );
}

type Column = 'per100' | 'serving';
type Nutrient = keyof LabelMacros;

const KJ_PER_KCAL = 4.184;

function norm(row: string): string {
  return row
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2') // "12,5 g" — decimal comma
    .replace(/(\d)\s+\.\s*(\d)/g, '$1.$2') // "12 .5" — OCR split a decimal
    .replace(/\s+/g, ' ')
    .trim();
}

const PER_100 = /(?:per|\/)\s*100\s*(?:g|gm|gms|ml)\b|\b100\s*(?:g|gm|gms|ml)\b/;
// A serving *column* header, not the "Serving size" line.
const PER_SERVING_COLUMN = /per\s*serv|per\s*portion|per\s*(?!100\s*(?:g|ml))\d+(?:\.\d+)?\s*(?:g|ml)\b/;

function classify(row: string): Nutrient | null {
  if (/\bprotein/.test(row)) return 'protein';
  if (/carbohydrate|\bcarbs?\b/.test(row) && !/of which|sugar|fib(?:re|er)|starch|polyol/.test(row)) {
    return 'carbs';
  }
  if (
    /\bfats?\b/.test(row) &&
    !/saturated|trans|mono|poly|unsat|\bsfa\b|\bmufa\b|\bpufa\b|from fat|cholesterol/.test(row)
  ) {
    return 'fat';
  }
  if (/\benergy\b|\bcalories\b|\bkcal\b|\bkj\b/.test(row) && !/from fat/.test(row)) return 'calories';
  return null;
}

/** The row's numbers, skipping %DV/%RDA values and milligram amounts. */
function numbersOf(row: string): { n: number; unit: string }[] {
  const out: { n: number; unit: string }[] = [];
  for (const m of row.matchAll(/(\d+(?:\.\d+)?)\s*(%|kcal|kj|cal|mg|mcg|µg|ug|g|gm)?/g)) {
    const unit = m[2] ?? '';
    if (unit === '%' || unit === 'mg' || unit === 'mcg' || unit === 'µg' || unit === 'ug') continue;
    out.push({ n: Number(m[1]), unit });
  }
  return out;
}

function energyValues(row: string): number[] {
  const nums = numbersOf(row);
  const kcal = nums.filter((x) => x.unit === 'kcal' || x.unit === 'cal');
  if (kcal.length) return kcal.map((x) => x.n);
  const kj = nums.filter((x) => x.unit === 'kj');
  if (kj.length) return kj.map((x) => x.n / KJ_PER_KCAL);
  const plain = nums.map((x) => x.n);
  const saysKj = /\bkj\b/.test(row);
  const saysKcal = /kcal|calorie/.test(row);
  if (saysKj && saysKcal) {
    // "Energy (kJ/kcal) 2142/512 643/154": a value is kcal when its kJ twin
    // (×4.184) is also on the row.
    const twins = plain.filter((n) => plain.some((m) => Math.abs(m - n * KJ_PER_KCAL) <= n * 0.12));
    if (twins.length) return twins;
  }
  return saysKj && !saysKcal ? plain.map((n) => n / KJ_PER_KCAL) : plain;
}

function gramsIn(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'g').toLowerCase();
  const grams = unit === 'kg' || unit === 'l' ? n * 1000 : n;
  return grams > 0 && grams < 10_000 ? grams : null;
}

/** Atwater check: printed energy must roughly match 4/4/9 from the macros. */
export function macrosConsistent(m: LabelMacros): boolean {
  const est = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  // Fibre (2 kcal/g) and polyols make labels legitimately drift from 4/4/9.
  return Math.abs(m.calories - est) <= Math.max(m.calories * 0.25, 25);
}

const scale = (m: LabelMacros, f: number): LabelMacros => ({
  calories: m.calories * f,
  protein: m.protein * f,
  carbs: m.carbs * f,
  fat: m.fat * f,
});

/**
 * Macros per 100 g and/or per serving from a label's text rows. Returns null
 * when no column adds up — a wrong label is worse than asking the model.
 */
export function parseLabelText(rawRows: string[]): ParsedLabel | null {
  const rows = rawRows.map(norm).filter(Boolean);
  const all = rows.join('\n');
  const firstNutrient = rows.findIndex((r) => classify(r) !== null);

  // Values per nutrient row, first row wins ("Total Fat" before "Saturated Fat").
  const values: Partial<Record<Nutrient, number[]>> = {};
  for (const row of rows) {
    const nutrient = classify(row);
    if (!nutrient || values[nutrient]) continue;
    // "Energy per 100 g 512" — the 100 is a basis, not a value.
    const bare = row.replace(new RegExp(PER_100.source, 'g'), ' ').replace(/per\s*\d+(?:\.\d+)?\s*(?:g|ml)\b/g, ' ');
    const nums = nutrient === 'calories' ? energyValues(bare) : numbersOf(bare).map((x) => x.n);
    if (nums.length) values[nutrient] = nums;
  }

  // Two columns when the rows say so, ordered by the header ("Per 100g |
  // Per serve"); a lone "Serving size 30 g" line above a per-100 g table
  // must not turn it into a serving column.
  const header = rows.slice(0, firstNutrient < 0 ? rows.length : firstNutrient + 1).join(' ');
  const at100 = header.search(PER_100);
  const atServ = header.search(PER_SERVING_COLUMN);
  const twoColumns = Object.values(values).filter((v) => v.length >= 2).length >= 2;
  let columns: Column[];
  if (twoColumns) {
    columns = atServ >= 0 && (at100 < 0 || atServ < at100) ? ['serving', 'per100'] : ['per100', 'serving'];
  } else {
    columns = at100 >= 0 ? ['per100'] : ['serving'];
  }

  const found: Record<Column, Partial<LabelMacros>> = { per100: {}, serving: {} };
  for (const [nutrient, nums] of Object.entries(values) as [Nutrient, number[]][]) {
    columns.forEach((col, i) => {
      if (nums[i] != null) found[col][nutrient] = nums[i];
    });
  }

  const complete = (p: Partial<LabelMacros>): LabelMacros | null => {
    if (p.protein == null || p.carbs == null || p.fat == null) return null;
    const m: LabelMacros = {
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      calories: p.calories ?? p.protein * 4 + p.carbs * 4 + p.fat * 9,
    };
    return macrosConsistent(m) ? m : null;
  };
  let per100g = complete(found.per100);
  let perServing = complete(found.serving);

  const servingGrams =
    gramsIn(all, /serving size[^\n]*?\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/) ??
    gramsIn(all, /serv(?:e|ing)?\s*(?:size)?\s*[:=(]?\s*(?:[a-z.]+\s*){0,3}\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/) ??
    gramsIn(all, /(\d+(?:\.\d+)?)\s*(g|ml)\s*\)?\s*(?:per\s*)?serv/) ??
    gramsIn(all, /per\s*(?!100\s*(?:g|ml))(\d+(?:\.\d+)?)\s*(g|ml)\b/);
  const packGrams = gramsIn(
    all,
    /net\s*(?:wt|weight|quantity|qty|contents?|mass)\.?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/,
  );
  const perPack = all.match(
    /(?:servings?|serves)\s*per\s*(?:container|pack(?:et|age)?)\s*[:\-]?\s*(?:about|approx\.?)?\s*(\d+(?:\.\d+)?)/,
  ) ?? all.match(/(\d+(?:\.\d+)?)\s*servings?\s*per\s*(?:container|pack)/);
  const servingRow = rawRows.find((r) => /serving size/i.test(r));
  const servingSize = servingRow ? servingRow.replace(/.*serving size\s*[:\-]?\s*/i, '').trim() || null : null;

  // One column plus the serving weight is enough to derive the other.
  if (servingGrams) {
    if (per100g && !perServing) perServing = scale(per100g, servingGrams / 100);
    if (perServing && !per100g) per100g = scale(perServing, 100 / servingGrams);
  }
  if (!per100g && !perServing) return null;

  return {
    per100g,
    perServing,
    servingGrams,
    servingSize,
    servingsPerContainer: perPack ? Number(perPack[1]) : null,
    packGrams,
  };
}
