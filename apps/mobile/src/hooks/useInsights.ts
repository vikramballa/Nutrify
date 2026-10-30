import { useQuery } from '@tanstack/react-query';
import { InsightsResponseSchema, RecipeNutritionSchema } from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

/** Real per-serving nutrition, computed server-side from USDA data. */
export function useNutrition(recipeId: string) {
  return useQuery({
    queryKey: ['nutrition', recipeId],
    queryFn: async () =>
      parseWith(
        RecipeNutritionSchema,
        await apiFetch(`/recipes/${recipeId}/nutrition`),
        'recipes/nutrition',
      ),
    staleTime: 15 * 60_000, // nutrition for a recipe rarely changes
    retry: false,
  });
}

/** Errors (incl. 503 no_ai_provider) surface via isError — the card hides then. */
export function useInsights(recipeId: string) {
  return useQuery({
    queryKey: ['insights', recipeId],
    queryFn: async () =>
      parseWith(
        InsightsResponseSchema,
        await apiFetch(`/recipes/${recipeId}/insights`, { method: 'POST' }),
        'recipes/insights',
      ),
    retry: false,
  });
}
