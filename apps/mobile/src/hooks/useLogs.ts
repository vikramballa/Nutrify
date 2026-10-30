import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FoodProductSchema,
  LogPreviewResponseSchema,
  MealLogSchema,
  TodayLogsResponseSchema,
  type CreateCustomLog,
  type CustomLogItem,
  type LogBarcode,
  type MealType,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const KEY = ['logs', 'today'];
// Logging anything moves the streak and the recent-meals row too.
const AFFECTED = [
  KEY,
  ['logs', 'recent'],
  ['streak'],
  ['progress', 'summary'],
  ['goals', 'adaptive'],
];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const queryKey of AFFECTED) qc.invalidateQueries({ queryKey });
}

export function useTodayLogs() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      parseWith(TodayLogsResponseSchema, await apiFetch('/logs/today'), 'logs/today'),
  });
}

export function useLogMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recipeId: string; mealType: MealType; servings?: number }) =>
      parseWith(
        MealLogSchema,
        await apiFetch('/logs', { method: 'POST', body: JSON.stringify(input) }),
        'logs:create',
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLogCustomMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomLog) =>
      parseWith(
        MealLogSchema,
        await apiFetch('/logs/custom', { method: 'POST', body: JSON.stringify(input) }),
        'logs:custom',
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Live macros for typed items before they are logged. Keyed on the items, so
 * an unchanged list is served from cache; the caller debounces keystrokes.
 */
export function useLogPreview(items: CustomLogItem[]) {
  return useQuery({
    queryKey: ['logs', 'preview', items],
    queryFn: async () =>
      parseWith(
        LogPreviewResponseSchema,
        await apiFetch('/logs/preview', { method: 'POST', body: JSON.stringify({ items }) }),
        'logs:preview',
      ),
    enabled: items.length > 0,
    staleTime: Infinity, // same items, same answer
    placeholderData: (prev) => prev,
    retry: false,
  });
}

/** Packaged food for a scanned barcode (Open Food Facts via the API cache). */
export function useBarcodeProduct(barcode: string | null) {
  return useQuery({
    queryKey: ['foods', 'barcode', barcode],
    queryFn: async () =>
      parseWith(FoodProductSchema, await apiFetch(`/foods/barcode/${barcode}`), 'foods:barcode'),
    enabled: barcode != null,
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogBarcode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogBarcode) =>
      parseWith(
        MealLogSchema,
        await apiFetch('/logs/barcode', { method: 'POST', body: JSON.stringify(input) }),
        'logs:barcode',
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Sensible default meal slot for "log it now". */
export function currentMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
