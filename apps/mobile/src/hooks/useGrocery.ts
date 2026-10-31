import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  GroceryItemSchema,
  GroceryFromRecipeResponseSchema,
  type GroceryFromRecipeRequest,
  type GroceryItem,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const KEY = ['grocery'];
const GroceryListSchema = z.array(GroceryItemSchema);

export function useGrocery() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEY,
    queryFn: async () => parseWith(GroceryListSchema, await apiFetch('/grocery'), 'grocery'),
  });

  const add = useMutation({
    mutationFn: async (name: string) =>
      parseWith(
        GroceryItemSchema,
        await apiFetch('/grocery', { method: 'POST', body: JSON.stringify({ name }) }),
        'grocery:add',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  // Adds a recipe's missing ingredients (or all, without `names`) in one
  // call; the server dedupes against what's already on the list and copies
  // each quantity from the recipe.
  const addFromRecipe = useMutation({
    mutationFn: async (input: GroceryFromRecipeRequest) =>
      parseWith(
        GroceryFromRecipeResponseSchema,
        await apiFetch('/grocery/from-recipe', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
        'grocery:addFromRecipe',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      apiFetch(`/grocery/${id}`, { method: 'PATCH', body: JSON.stringify({ checked }) }),
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<GroceryItem[]>(KEY);
      qc.setQueryData<GroceryItem[]>(KEY, (old) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, checked } : i)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/grocery/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<GroceryItem[]>(KEY);
      qc.setQueryData<GroceryItem[]>(KEY, (old) => (old ?? []).filter((i) => i.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { list, add, addFromRecipe, toggle, remove };
}
