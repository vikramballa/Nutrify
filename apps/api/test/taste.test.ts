import { describe, it, expect } from 'vitest';
import {
  tokenize,
  recipeTokens,
  buildProfile,
  scoreRecipe,
  EVENT_WEIGHTS,
  type TasteEvent,
} from '../src/services/taste.js';

describe('tokenize', () => {
  it('lowercases, splits on non-letters, drops stopwords and short tokens', () => {
    expect(tokenize('The Quick, Easy CHICKEN Curry!')).toEqual(['chicken', 'curry']);
  });

  it('drops tokens shorter than 3 chars', () => {
    expect(tokenize('a an ox cow')).toEqual(['cow']);
  });
});

describe('recipeTokens', () => {
  it('unions unique tokens from name, category, cuisine and ingredients', () => {
    const tokens = recipeTokens({
      name: 'Chicken Curry',
      category: 'Curry',
      cuisine: 'Indian',
      ingredients: [{ name: 'chicken breast' }, { name: 'garam masala' }],
    });
    expect(tokens).toEqual(['chicken', 'curry', 'indian', 'breast', 'garam', 'masala']);
  });
});

const tokensByRecipeId = new Map([
  ['r1', ['chicken', 'curry']],
  ['r2', ['beef', 'stew']],
]);
const vocab = new Set(['chicken', 'curry', 'beef', 'stew', 'spicy']);

function ev(partial: Partial<TasteEvent>): TasteEvent {
  return {
    type: 'search',
    recipeId: null,
    term: null,
    weight: 1,
    createdAt: new Date(),
    ...partial,
  };
}

describe('buildProfile', () => {
  it('adds a recipe event\'s tokens with the event weight, normalized to max 1', () => {
    const p = buildProfile(
      [ev({ type: 'view', recipeId: 'r1', weight: EVENT_WEIGHTS.view })],
      tokensByRecipeId,
      vocab,
    );
    expect(p.get('chicken')).toBe(1);
    expect(p.get('curry')).toBe(1);
    expect(p.has('beef')).toBe(false);
  });

  it('filters free-text terms against the recipe vocabulary', () => {
    const p = buildProfile(
      [ev({ type: 'search', term: 'spicy nonsense-token', weight: EVENT_WEIGHTS.search })],
      tokensByRecipeId,
      vocab,
    );
    expect(p.get('spicy')).toBe(1);
    expect(p.has('nonsense')).toBe(false);
  });

  it('skips zero-weight events (suggest markers)', () => {
    const p = buildProfile(
      [ev({ type: 'suggest', recipeId: 'r1', weight: 0 })],
      tokensByRecipeId,
      vocab,
    );
    expect(p.size).toBe(0);
  });

  it('decays older events (~3%/day): a fresh event beats an old one', () => {
    const now = Date.now();
    const p = buildProfile(
      [
        ev({ term: 'spicy', weight: 3, createdAt: new Date(now - 30 * 86_400_000) }),
        ev({ term: 'curry', weight: 3, createdAt: new Date(now) }),
      ],
      tokensByRecipeId,
      vocab,
      now,
    );
    expect(p.get('curry')).toBe(1); // normalized max
    expect(p.get('spicy')!).toBeCloseTo(0.97 ** 30, 3);
  });

  it('accumulates repeated signals for the same token', () => {
    const p = buildProfile(
      [
        ev({ term: 'curry', weight: 3 }),
        ev({ term: 'curry', weight: 3 }),
        ev({ term: 'spicy', weight: 3 }),
      ],
      tokensByRecipeId,
      vocab,
    );
    expect(p.get('curry')).toBe(1);
    expect(p.get('spicy')!).toBeCloseTo(0.5, 5);
  });
});

describe('scoreRecipe', () => {
  const profile = new Map([
    ['chicken', 1],
    ['curry', 0.5],
  ]);

  it('scores by dot product dampened by sqrt(token count)', () => {
    const { score, matches } = scoreRecipe(profile, ['chicken', 'curry'], [], 0);
    expect(score).toBeCloseTo(1.5 / Math.SQRT2, 5);
    expect(matches.map((m) => m.token)).toEqual(['chicken', 'curry']);
  });

  it('applies a condition penalty for avoid-listed ingredients', () => {
    // diabetes avoids 'sugar' and 'honey'
    const clean = scoreRecipe(profile, ['chicken'], [], 0);
    const sugary = scoreRecipe(profile, ['chicken', 'sugar', 'honey'], ['diabetes'], 0);
    expect(sugary.conditionPenalty).toBe(1); // 0.5 × 2 avoided tokens
    expect(sugary.score).toBeCloseTo(1 / Math.sqrt(3) - 1, 5);
    expect(sugary.score).toBeLessThan(clean.score);
  });

  it('applies an ignored-suggestion penalty capped at 4', () => {
    expect(scoreRecipe(profile, ['chicken'], [], 2).ignoredPenalty).toBeCloseTo(0.3, 5);
    expect(scoreRecipe(profile, ['chicken'], [], 100).ignoredPenalty).toBeCloseTo(0.6, 5);
  });

  it('scores zero with an empty profile', () => {
    expect(scoreRecipe(new Map(), ['chicken'], [], 0).score).toBe(0);
  });
});
