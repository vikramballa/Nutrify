import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { RecipeSchema } from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const KEY = ['favorites'];
const FavoritesSchema = z.object({ recipes: z.array(RecipeSchema) });

export function useFavorites() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      parseWith(FavoritesSchema, await apiFetch('/favorites'), 'favorites'),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) =>
      apiFetch<{ favorited: boolean }>(`/favorites/${recipeId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
