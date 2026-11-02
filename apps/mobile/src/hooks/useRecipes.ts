import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  RecipeSchema,
  RecommendationsResponseSchema,
  SearchResponseSchema,
  type Recipe,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const RecipesSchema = z.object({ recipes: z.array(RecipeSchema) });

/**
 * Lists ask for recipe cards: no ingredients or instructions, which are most
 * of a recipe's bytes and only the detail screen shows. useFullRecipe fetches
 * them when a recipe is opened.
 */
export const CARD = 'fields=card';

/**
 * The full recipe behind a list card. A recipe that is already complete
 * (opened from somewhere that sent it whole) is used as-is, with no request.
 */
export function useFullRecipe(recipe: Recipe) {
  const query = useQuery({
    queryKey: ['recipe', recipe.id],
    queryFn: async () => parseWith(RecipeSchema, await apiFetch(`/recipes/${recipe.id}`), 'recipes/:id'),
    enabled: !!recipe.partial,
    staleTime: 30 * 60_000, // recipe text barely changes
  });
  const full = query.data ?? (recipe.partial ? null : recipe);
  return {
    /** The full recipe once known, else the card (empty ingredients/steps). */
    recipe: full ?? recipe,
    complete: !!full,
    failed: query.isError,
    retry: query.refetch,
  };
}

export function useRecipeSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: async ({ signal }) =>
      parseWith(
        SearchResponseSchema,
        await apiFetch(`/recipes/search?q=${encodeURIComponent(query)}&${CARD}`, { signal }),
        'recipes/search',
      ),
    enabled: query.trim().length > 0,
    staleTime: 60_000, // same search term within a minute reuses the cache
    retry: false,
  });
}

export function useRandomRecipes(count: number) {
  return useQuery({
    queryKey: ['random', count],
    queryFn: async () =>
      parseWith(RecipesSchema, await apiFetch(`/recipes/random?count=${count}&${CARD}`), 'recipes/random'),
    staleTime: 15 * 60_000, // "Recipe of the Day" / suggestions stay put for a while
  });
}

/** The whole library for the browse grid. */
export function useBrowseRecipes(take = 30) {
  return useQuery({
    queryKey: ['browse', take],
    queryFn: async () =>
      parseWith(RecipesSchema, await apiFetch(`/recipes/browse?take=${take}&${CARD}`), 'recipes/browse'),
    staleTime: 10 * 60_000,
  });
}

export function useCuisines() {
  return useQuery({
    queryKey: ['cuisines'],
    queryFn: async () =>
      parseWith(
        z.object({ cuisines: z.array(z.string()) }),
        await apiFetch('/recipes/cuisines'),
        'recipes/cuisines',
      ),
    staleTime: 24 * 60 * 60_000, // cuisine list is effectively static
  });
}

export function useCuisineRecipes(cuisine: string) {
  return useQuery({
    queryKey: ['cuisine', cuisine],
    queryFn: async () =>
      parseWith(
        RecipesSchema,
        await apiFetch(`/recipes/by-cuisine?cuisine=${encodeURIComponent(cuisine)}&${CARD}`),
        'recipes/by-cuisine',
      ),
    enabled: cuisine.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** Suggestions personalized by the behavior-learning backend (no LLM). */
export function useRecommendedRecipes(count: number) {
  return useQuery({
    queryKey: ['recommended', count],
    queryFn: async () =>
      parseWith(
        RecommendationsResponseSchema,
        await apiFetch(`/recipes/recommended?count=${count}&${CARD}`),
        'recipes/recommended',
      ),
    staleTime: 10 * 60_000, // re-learn periodically instead of once per session
  });
}

/** 👍 "This was a good recipe": a taste signal, and it keeps AI recipes listed. */
export function useLikeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) =>
      apiFetch<{ liked: boolean }>(`/recipes/${recipeId}/like`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommended'] }),
  });
}

/** "Not for me" — the only negative signal the taste engine ever receives. */
export function useDislikeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) =>
      apiFetch<{ disliked: boolean }>(`/recipes/${recipeId}/dislike`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommended'] }),
  });
}
