import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  RecipeSchema,
  RecommendationsResponseSchema,
  SearchResponseSchema,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const RecipesSchema = z.object({ recipes: z.array(RecipeSchema) });

export function useRecipeSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: async ({ signal }) =>
      parseWith(
        SearchResponseSchema,
        await apiFetch(`/recipes/search?q=${encodeURIComponent(query)}`, { signal }),
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
      parseWith(RecipesSchema, await apiFetch(`/recipes/random?count=${count}`), 'recipes/random'),
    staleTime: 15 * 60_000, // "Recipe of the Day" / suggestions stay put for a while
  });
}

/** The whole library for the browse grid. */
export function useBrowseRecipes(take = 30) {
  return useQuery({
    queryKey: ['browse', take],
    queryFn: async () =>
      parseWith(RecipesSchema, await apiFetch(`/recipes/browse?take=${take}`), 'recipes/browse'),
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
        await apiFetch(`/recipes/by-cuisine?cuisine=${encodeURIComponent(cuisine)}`),
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
        await apiFetch(`/recipes/recommended?count=${count}`),
        'recipes/recommended',
      ),
    staleTime: 10 * 60_000, // re-learn periodically instead of once per session
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
