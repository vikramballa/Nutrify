import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MealLogSchema,
  RecentMealsResponseSchema,
  StreakSummarySchema,
  type MealType,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const STREAK_KEY = ['streak'];
const RECENT_KEY = ['logs', 'recent'];
const TODAY_KEY = ['logs', 'today'];

export function useStreak() {
  return useQuery({
    queryKey: STREAK_KEY,
    queryFn: async () => parseWith(StreakSummarySchema, await apiFetch('/streak'), 'streak'),
    staleTime: 60_000,
  });
}

/** The handful of meals worth a one-tap repeat. */
export function useRecentMeals() {
  return useQuery({
    queryKey: RECENT_KEY,
    queryFn: async () =>
      parseWith(RecentMealsResponseSchema, await apiFetch('/logs/recent'), 'logs/recent'),
    staleTime: 60_000,
  });
}

export interface RepeatInput {
  logId: string;
  mealType?: MealType;
  servings?: number;
}

/** Re-log a past meal. The server copies the macros; we only pick which. */
export function useRepeatMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RepeatInput) =>
      parseWith(
        MealLogSchema,
        await apiFetch('/logs/repeat', { method: 'POST', body: JSON.stringify(input) }),
        'logs:repeat',
      ),
    onSuccess: () => {
      for (const key of [TODAY_KEY, RECENT_KEY, STREAK_KEY, ['progress', 'summary']]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
