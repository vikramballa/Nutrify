import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  CoachInsightSchema,
  MealPhotoAnalysisSchema,
  NutritionLabelAnalysisSchema,
  PantryResponseSchema,
  UsualDishSchema,
  type CoachInsight,
  type MealScanFeedback,
  type MealType,
  type PantryResponse,
} from '@nutrichef/shared';
import { apiFetch, parseWith, type ApiError } from '../api/client';

const AnalysisResponseSchema = MealPhotoAnalysisSchema.extend({
  provider: z.string(),
  // The model's own dish name (feedback is keyed on it) and whether the name
  // shown came from one of the user's past corrections.
  modelName: z.string().optional(),
  learned: z.boolean().optional(),
  // The portion of this dish the user logged before, if any.
  usual: UsualDishSchema.nullable().optional(),
});
export type MealPhotoAnalysisResult = z.infer<typeof AnalysisResponseSchema>;

const FeedbackResponseSchema = z.object({
  saved: z.boolean(),
  analysis: AnalysisResponseSchema.nullable(),
});
export type MealScanFeedbackResult = z.infer<typeof FeedbackResponseSchema>;

/**
 * "Is this right?" after a meal scan. On "no" with a name (and the photo),
 * the API remembers the correction for next time and re-estimates the plate
 * as that dish; `analysis` is null when it couldn't re-estimate.
 */
export function useMealScanFeedback() {
  return useMutation<MealScanFeedbackResult, ApiError, MealScanFeedback>({
    mutationFn: async (input) =>
      parseWith(
        FeedbackResponseSchema,
        await apiFetch('/vision/meal/feedback', { method: 'POST', body: JSON.stringify(input) }),
        'vision/meal/feedback',
      ),
    retry: false,
  });
}

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

/**
 * Nutrition label photo (data URL) → macros read off the label by the model.
 * `ocrText` is what on-device OCR read but couldn't parse; it helps the
 * model with digits the photo blurs.
 */
export function useAnalyzeNutritionLabel() {
  return useMutation<NutritionLabelAnalysisResult, ApiError, { image: string; ocrText?: string }>({
    mutationFn: async (input) =>
      parseWith(
        LabelResponseSchema,
        await apiFetch('/vision/label', { method: 'POST', body: JSON.stringify(input) }),
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
