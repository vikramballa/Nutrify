import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  CoachInsightSchema,
  MealPhotoAnalysisSchema,
  NutritionLabelAnalysisSchema,
  PantryResponseSchema,
  type CoachInsight,
  type MealType,
  type PantryResponse,
} from '@nutrichef/shared';
import { apiFetch, parseWith, type ApiError } from '../api/client';

const AnalysisResponseSchema = MealPhotoAnalysisSchema.extend({ provider: z.string() });
export type MealPhotoAnalysisResult = z.infer<typeof AnalysisResponseSchema>;

/** Photo (data URL) → dish name and per-plate macros. Nothing is logged yet. */
export function useAnalyzeMealPhoto() {
  return useMutation<MealPhotoAnalysisResult, ApiError, string>({
    mutationFn: async (image) =>
      parseWith(
        AnalysisResponseSchema,
        await apiFetch('/vision/meal', { method: 'POST', body: JSON.stringify({ image }) }),
        'vision/meal',
      ),
    retry: false, // a failed scan should surface immediately, not after 3 waits
  });
}

const LabelResponseSchema = NutritionLabelAnalysisSchema.extend({ provider: z.string() });
export type NutritionLabelAnalysisResult = z.infer<typeof LabelResponseSchema>;

/** Nutrition Facts panel photo (data URL) → per-serving macros read off the label. */
export function useAnalyzeNutritionLabel() {
  return useMutation<NutritionLabelAnalysisResult, ApiError, string>({
    mutationFn: async (image) =>
      parseWith(
        LabelResponseSchema,
        await apiFetch('/vision/label', { method: 'POST', body: JSON.stringify({ image }) }),
        'vision/label',
      ),
    retry: false,
  });
}

/** Ingredients on hand → three dishes, easiest first. */
export function usePantryIdeas() {
  return useMutation<PantryResponse, ApiError, { ingredients: string[]; mealType?: MealType }>({
    mutationFn: async (input) =>
      parseWith(
        PantryResponseSchema,
        await apiFetch('/pantry/cook', { method: 'POST', body: JSON.stringify(input) }),
        'pantry/cook',
      ),
    retry: false,
  });
}

/**
 * Weekly review of what was actually logged. `enabled` lets the Progress
 * screen hold the call back until there is something worth reviewing — the
 * route 422s on an empty week, and surfacing that as an error would be
 * misleading rather than helpful.
 */
export function useWeeklyCoach(enabled: boolean) {
  return useQuery<CoachInsight, ApiError>({
    queryKey: ['coach', 'weekly'],
    queryFn: async () =>
      parseWith(CoachInsightSchema, await apiFetch('/coach/weekly'), 'coach/weekly'),
    enabled,
    staleTime: 60 * 60_000, // a week of logs does not change minute to minute
    retry: false,
  });
}
