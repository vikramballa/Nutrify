import { describe, expect, it } from 'vitest';
import { splitSteps } from './cookSteps';

describe('splitSteps', () => {
  it('splits TheMealDB blobs on embedded numbering and strips the markers', () => {
    const raw =
      '1.\tSlice 1 lb. eggplant into quarters. Let sit 20 minutes. ' +
      '2. Peel and thinly slice 8 garlic cloves. Cook about 5 minutes. ' +
      '3. Place 4 oz. ground pork in same pot.';
    const steps = splitSteps(raw);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/^Slice 1 lb/);
    expect(steps[1]).toMatch(/^Peel and thinly slice/);
    expect(steps[2]).toBe('Place 4 oz. ground pork in same pot.');
  });

  it('prefers blank-line paragraphs and drops their leading numbers', () => {
    expect(splitSteps('1. Soak the dal overnight.\n\n2. Grind to a batter.')).toEqual([
      'Soak the dal overnight.',
      'Grind to a batter.',
    ]);
  });

  it('does not cut on decimals or prose digits', () => {
    const raw = 'Add 1.5 cups water and 2 tsp salt, then simmer for 3 minutes until reduced.';
    expect(splitSteps(raw)).toEqual([raw]);
  });

  it('ignores out-of-sequence markers', () => {
    // "7." is not the next expected number, so it is prose, not a step.
    const raw = 'Bake at 350F. See note 7. Serve hot.';
    expect(splitSteps(raw)).toEqual([raw]);
  });

  it('falls back to newline-separated lines', () => {
    const steps = splitSteps('Boil the water thoroughly\nAdd the rice and stir well');
    expect(steps).toEqual(['Boil the water thoroughly', 'Add the rice and stir well']);
  });

  it('keeps a single paragraph as one step', () => {
    expect(splitSteps('Mix everything and bake.')).toEqual(['Mix everything and bake.']);
  });

  it('returns nothing for empty input', () => {
    expect(splitSteps('   ')).toEqual([]);
  });
});
