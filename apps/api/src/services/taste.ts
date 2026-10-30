import type { Recipe } from '@nutrichef/shared';
import { prisma } from '../lib/prisma.js';
import { toDTO } from './recipeService.js';

/**
 * The recommendation "brain": no LLM anywhere. It learns from usage by
 * logging weighted implicit-feedback events (searches, views, grocery adds,
 * chat topics), folding them into a time-decayed taste profile over recipe
 * feature tokens (ingredients, cuisine, category, name words), and scoring
 * candidate recipes against that profile — with penalties for the user's
 * medical conditions and for suggestions they keep ignoring, plus a slice
 * of random exploration so tastes can still evolve.
 */

// How much each behavior says about taste. Grocery adds are strongest:
// the user is actually going to cook/eat that.
export const EVENT_WEIGHTS = {
  search: 3,
  view: 2,
  grocery: 5,
  chat: 3,
  log: 4, // they actually ate it
  favorite: 4, // they explicitly saved it
  // Without a negative signal the engine could only ever learn what someone
  // likes, so a rejected dish kept resurfacing until the weak ignored-penalty
  // caught up. An explicit "not for me" outweighs a passing view.
  dislike: -6,
  suggest: 0, // recorded only so we can detect ignored suggestions
} as const;
export type EventType = keyof typeof EVENT_WEIGHTS;

/** Older signals fade: an event loses ~3%/day, so last week beats last month. */
const DAILY_DECAY = 0.97;
const EVENT_WINDOW_DAYS = 90;
const MAX_EVENTS = 500;
/** Fraction of recommendations reserved for random exploration. */
const EXPLORE_RATIO = 0.15;

// ponytail: naive keyword lists per condition; swap for real nutrition data
// (sugar/sodium per recipe) when the recipe source provides it.
const CONDITION_AVOID: Record<string, string[]> = {
  diabetes: ['sugar', 'honey', 'syrup', 'chocolate', 'caramel', 'dessert', 'cake', 'pudding'],
  hypertension: ['bacon', 'sausage', 'salami', 'ham', 'anchovy', 'soy'],
  high_cholesterol: ['butter', 'cream', 'lard', 'bacon', 'fried'],
};

const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'style', 'recipe', 'easy', 'quick',
  'homemade', 'best', 'classic', 'fresh', 'large', 'small', 'medium',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

interface RecipeFeatures {
  name: string;
  category: string;
  cuisine: string;
  ingredients: { name: string }[];
}

/** A recipe's taste fingerprint: unique tokens from all its features. */
export function recipeTokens(r: RecipeFeatures): string[] {
  const parts = [r.name, r.category, r.cuisine, ...r.ingredients.map((i) => i.name)];
  return [...new Set(parts.flatMap(tokenize))];
}

export interface TasteEvent {
  type: string;
  recipeId: string | null;
  term: string | null;
  weight: number;
  createdAt: Date;
}

/**
 * Fold events into a token→score map, normalized so the strongest taste = 1.
 * Free-text events (search/grocery/chat) only count tokens that exist in the
 * recipe vocabulary — that's how chat noise gets filtered without an LLM.
 */
export function buildProfile(
  events: TasteEvent[],
  tokensByRecipeId: Map<string, string[]>,
  vocab: Set<string>,
  now = Date.now(),
): Map<string, number> {
  const profile = new Map<string, number>();
  for (const e of events) {
    if (e.weight === 0) continue; // suggest markers carry no taste information
    const ageDays = Math.max(0, (now - e.createdAt.getTime()) / 86_400_000);
    const strength = e.weight * DAILY_DECAY ** ageDays;
    const tokens = e.recipeId
      ? tokensByRecipeId.get(e.recipeId) ?? []
      : tokenize(e.term ?? '').filter((t) => vocab.has(t));
    for (const t of tokens) profile.set(t, (profile.get(t) ?? 0) + strength);
  }
  // Normalize on the strongest *magnitude*, so a profile made mostly of
  // dislikes scales the same way a positive one does and keeps its signs.
  const max = Math.max(...[...profile.values()].map(Math.abs), 0);
  if (max > 0) for (const [t, v] of profile) profile.set(t, v / max);
  return profile;
}

export interface ScoreBreakdown {
  score: number;
  matches: { token: string; value: number }[];
  conditionPenalty: number;
  ignoredPenalty: number;
}

/** Match a recipe against the profile; higher = more "them". */
export function scoreRecipe(
  profile: Map<string, number>,
  tokens: string[],
  conditions: string[],
  ignoredCount: number,
): ScoreBreakdown {
  const matches = tokens
    .filter((t) => profile.has(t))
    .map((t) => ({ token: t, value: profile.get(t)! }))
    .sort((a, b) => b.value - a.value);
  // Dot product, dampened by recipe length so 20-ingredient recipes don't
  // win by volume alone.
  const base = matches.reduce((s, m) => s + m.value, 0) / Math.sqrt(tokens.length || 1);
  const avoid = conditions.flatMap((c) => CONDITION_AVOID[c] ?? []);
  const conditionPenalty = 0.5 * tokens.filter((t) => avoid.includes(t)).length;
  const ignoredPenalty = 0.15 * Math.min(ignoredCount, 4);
  return {
    score: base - conditionPenalty - ignoredPenalty,
    matches: matches.slice(0, 8),
    conditionPenalty,
    ignoredPenalty,
  };
}

// ---------------------------------------------------------------------------
// DB glue
// ---------------------------------------------------------------------------

/** Fire-and-forget: recording a signal must never slow down or break a route. */
export function logEvent(
  userId: string,
  type: EventType,
  data: { recipeId?: string; term?: string } = {},
): void {
  prisma.userEvent
    .create({
      data: {
        userId,
        type,
        recipeId: data.recipeId,
        term: data.term?.slice(0, 200),
        weight: EVENT_WEIGHTS[type],
      },
    })
    .catch((err) => console.warn('[taste] event log failed:', (err as Error).message));
}

/**
 * Signals only. `suggest` rows carry weight 0 and are written on every
 * recommendation, so including them here let them crowd real searches and
 * views out of the MAX_EVENTS window until the profile came back empty.
 */
async function signalEvents(userId: string): Promise<TasteEvent[]> {
  const since = new Date(Date.now() - EVENT_WINDOW_DAYS * 86_400_000);
  return prisma.userEvent.findMany({
    where: { userId, createdAt: { gte: since }, weight: { not: 0 } },
    orderBy: { createdAt: 'desc' },
    take: MAX_EVENTS,
  });
}

/** How often each recipe was suggested but never opened, within the window. */
async function ignoredCounts(userId: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - EVENT_WINDOW_DAYS * 86_400_000);
  const [suggested, viewed] = await Promise.all([
    prisma.userEvent.groupBy({
      by: ['recipeId'],
      where: { userId, type: 'suggest', recipeId: { not: null }, createdAt: { gte: since } },
      _count: { recipeId: true },
    }),
    prisma.userEvent.findMany({
      where: { userId, type: 'view', recipeId: { not: null }, createdAt: { gte: since } },
      distinct: ['recipeId'],
      select: { recipeId: true },
    }),
  ]);
  const opened = new Set(viewed.map((v) => v.recipeId));
  const counts = new Map<string, number>();
  for (const row of suggested) {
    if (row.recipeId && !opened.has(row.recipeId)) counts.set(row.recipeId, row._count.recipeId);
  }
  return counts;
}

interface RecipeIndex {
  rows: (RecipeFeatures & { id: string })[];
  tokensByRecipeId: Map<string, string[]>;
  vocab: Set<string>;
}

// The recipe corpus is shared by every user and changes only when a recipe is
// imported, so tokenizing it per request was pure waste: without this the
// route read every recipe and every ingredient row on each call.
// ponytail: process-local cache with a TTL — move to Redis if the API ever
// runs more than a handful of instances.
const INDEX_TTL_MS = 5 * 60_000;
const MAX_CANDIDATES = 5000;
let indexCache: { at: number; index: RecipeIndex } | null = null;

async function recipeIndex(): Promise<RecipeIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  const rows = await prisma.recipe.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      cuisine: true,
      ingredients: { select: { name: true } },
    },
    take: MAX_CANDIDATES,
  });
  const tokensByRecipeId = new Map(rows.map((r) => [r.id, recipeTokens(r)]));
  const index: RecipeIndex = {
    rows,
    tokensByRecipeId,
    vocab: new Set([...tokensByRecipeId.values()].flat()),
  };
  indexCache = { at: Date.now(), index };
  return index;
}

interface Brain {
  profile: Map<string, number>;
  candidates: { recipeId: string; name: string; tokens: string[]; breakdown: ScoreBreakdown }[];
  conditions: string[];
}

/** Load events + candidates and score everything. Shared by recommend/explain. */
async function think(userId: string): Promise<Brain> {
  const [events, user, ignored, index] = await Promise.all([
    signalEvents(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { conditions: true } }),
    ignoredCounts(userId),
    recipeIndex(),
  ]);
  const profile = buildProfile(events, index.tokensByRecipeId, index.vocab);
  const conditions = user?.conditions ?? [];

  const candidates = index.rows
    .map((r) => {
      const tokens = index.tokensByRecipeId.get(r.id)!;
      return {
        recipeId: r.id,
        name: r.name,
        tokens,
        breakdown: scoreRecipe(profile, tokens, conditions, ignored.get(r.id) ?? 0),
      };
    })
    .sort((a, b) => b.breakdown.score - a.breakdown.score);
  return { profile, candidates, conditions };
}

export interface Recommendation {
  recipes: Recipe[];
  personalized: boolean;
  /** recipeId → the taste tokens that earned it a place, strongest first. */
  reasons: Record<string, string[]>;
}

/** How many matched tokens to show as the "why this?" explanation. */
const REASON_TOKENS = 3;

export async function recommend(userId: string, count: number): Promise<Recommendation> {
  const { profile, candidates } = await think(userId);
  if (candidates.length === 0) return { recipes: [], personalized: false, reasons: {} };
  // Cold start: no signals yet — anything goes.
  const personalized = profile.size > 0;

  let picks: typeof candidates;
  if (personalized) {
    const exploreN = Math.min(
      Math.max(1, Math.round(count * EXPLORE_RATIO)),
      Math.max(candidates.length - count, 0),
    );
    const top = candidates.slice(0, count - exploreN);
    const rest = candidates.slice(count - exploreN);
    const explore = [...rest].sort(() => Math.random() - 0.5).slice(0, exploreN);
    picks = [...top, ...explore];
  } else {
    picks = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
  }

  // Only the winners are loaded in full; scoring needs tokens, not DTOs.
  const rows = await prisma.recipe.findMany({
    where: { id: { in: picks.map((p) => p.recipeId) } },
    include: { ingredients: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const recipes = picks.map((p) => byId.get(p.recipeId)).filter(Boolean).map((r) => toDTO(r!));

  // Remember what we showed, so ignoring it becomes a negative signal.
  prisma.userEvent
    .createMany({
      data: picks.map((p) => ({
        userId,
        type: 'suggest',
        recipeId: p.recipeId,
        weight: 0,
      })),
    })
    .catch((err) => console.warn('[taste] suggest log failed:', (err as Error).message));

  // The scoring already knows why each recipe won; throwing that away and
  // showing a bare grid is what made the whole engine feel like a random feed.
  const reasons: Record<string, string[]> = {};
  for (const p of picks) {
    reasons[p.recipeId] = p.breakdown.matches
      .filter((m) => m.value > 0)
      .slice(0, REASON_TOKENS)
      .map((m) => m.token);
  }

  return { recipes, personalized, reasons };
}

/** Developer X-ray: the raw taste profile and per-recipe score breakdowns. */
export async function explain(userId: string) {
  const { profile, candidates, conditions } = await think(userId);
  return {
    conditions,
    profile: [...profile.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([token, value]) => ({ token, value: Number(value.toFixed(3)) })),
    ranking: candidates.slice(0, 15).map((c) => ({
      name: c.name,
      score: Number(c.breakdown.score.toFixed(3)),
      matches: c.breakdown.matches.map((m) => `${m.token}(${m.value.toFixed(2)})`),
      conditionPenalty: c.breakdown.conditionPenalty,
      ignoredPenalty: c.breakdown.ignoredPenalty,
    })),
  };
}
