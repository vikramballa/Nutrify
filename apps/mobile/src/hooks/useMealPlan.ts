import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AutoFillResponseSchema,
  MealPlanEntrySchema,
  MealPlanWeekResponseSchema,
  MealPlanToGroceryResponseSchema,
  type MealPlanEntry,
  type MealPlanSlot,
  type MealPlanWeekResponse,
  type Recipe,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

/** Local YYYY-MM-DD day key (the API normalizes any day to its Monday week). */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Monday of the week containing `d` (local time). */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function shiftWeek(monday: Date, delta: number): Date {
  const m = new Date(monday);
  m.setDate(m.getDate() + delta * 7);
  return m;
}

const key = (week: string) => ['meal-plan', week] as const;

/** Recompute one day's totals after an optimistic change. */
function recomputeDay(
  data: MealPlanWeekResponse,
  date: string,
  entries: MealPlanEntry[],
): MealPlanWeekResponse {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    if (e.date !== date || !e.recipe) continue;
    totals.calories += (e.recipe.calories ?? 0) * e.servings;
    totals.protein += (e.recipe.protein ?? 0) * e.servings;
    totals.carbs += (e.recipe.carbs ?? 0) * e.servings;
    totals.fat += (e.recipe.fat ?? 0) * e.servings;
  }
  return {
    ...data,
    entries,
    days: data.days.map((d) => (d.date === date ? { date, ...totals } : d)),
  };
}

export function useMealPlan(week: string) {
  return useQuery({
    queryKey: key(week),
    queryFn: async () =>
      parseWith(
        MealPlanWeekResponseSchema,
        await apiFetch(`/meal-plan?week=${week}`),
        'meal-plan',
      ),
  });
}

export interface AddEntryInput {
  date: string;
  slot: MealPlanSlot;
  recipe?: Recipe;
  customName?: string;
}

export function useAddMealPlanEntry(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, slot, recipe, customName }: AddEntryInput) =>
      parseWith(
        MealPlanEntrySchema,
        await apiFetch('/meal-plan', {
          method: 'POST',
          body: JSON.stringify({
            date,
            slot,
            recipeId: recipe?.id,
            customName,
          }),
        }),
        'meal-plan:add',
      ),
    onMutate: async ({ date, slot, recipe, customName }) => {
      await qc.cancelQueries({ queryKey: key(week) });
      const prev = qc.getQueryData<MealPlanWeekResponse>(key(week));
      if (prev) {
        const optimistic: MealPlanEntry = {
          id: `temp-${Date.now()}`,
          date,
          slot,
          recipeId: recipe?.id ?? null,
          customName: customName ?? null,
          servings: 1,
          recipe: recipe
            ? {
                id: recipe.id,
                title: recipe.name,
                imageUrl: recipe.imageUrl,
                calories: recipe.calories,
                protein: recipe.protein,
                carbs: recipe.carbs,
                fat: recipe.fat,
                prepMinutes: recipe.prepMinutes,
                cookMinutes: recipe.cookMinutes,
              }
            : null,
        };
        qc.setQueryData(key(week), recomputeDay(prev, date, [...prev.entries, optimistic]));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key(week), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key(week) }),
  });
}

export function useRemoveMealPlanEntry(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/meal-plan/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key(week) });
      const prev = qc.getQueryData<MealPlanWeekResponse>(key(week));
      if (prev) {
        const target = prev.entries.find((e) => e.id === id);
        const entries = prev.entries.filter((e) => e.id !== id);
        qc.setQueryData(
          key(week),
          target ? recomputeDay(prev, target.date, entries) : { ...prev, entries },
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key(week), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key(week) }),
  });
}

export function useAutoFillWeek(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      parseWith(
        AutoFillResponseSchema,
        await apiFetch(`/meal-plan/auto-fill?week=${week}`, { method: 'POST' }),
        'meal-plan:auto-fill',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(week) }),
  });
}

export function useMealPlanToGrocery(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      parseWith(
        MealPlanToGroceryResponseSchema,
        await apiFetch(`/meal-plan/to-grocery?week=${week}`, { method: 'POST' }),
        'meal-plan:to-grocery',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  });
}
