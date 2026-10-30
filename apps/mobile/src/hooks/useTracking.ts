import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  WaterLogSchema,
  WaterTodayResponseSchema,
  WeightEntrySchema,
  ProgressSummaryResponseSchema,
  type WaterTodayResponse,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const WATER_KEY = ['water', 'today'];
const WEIGHT_KEY = ['weight'];
const PROGRESS_KEY = ['progress', 'summary'];

const WeightListSchema = z.array(WeightEntrySchema);

/** UTC day key — matches the server's day granularity. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useWaterToday() {
  return useQuery({
    queryKey: WATER_KEY,
    queryFn: async () =>
      parseWith(WaterTodayResponseSchema, await apiFetch('/water/today'), 'water/today'),
  });
}

export function useAddWater() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ml: number) =>
      parseWith(
        WaterLogSchema,
        await apiFetch('/water', { method: 'POST', body: JSON.stringify({ ml }) }),
        'water:add',
      ),
    onMutate: async (ml) => {
      await qc.cancelQueries({ queryKey: WATER_KEY });
      const prev = qc.getQueryData<WaterTodayResponse>(WATER_KEY);
      qc.setQueryData<WaterTodayResponse>(WATER_KEY, (old) => ({
        date: old?.date ?? todayKey(),
        totalMl: (old?.totalMl ?? 0) + ml,
        entries: [
          ...(old?.entries ?? []),
          { id: `temp-${Date.now()}`, date: todayKey(), ml, createdAt: new Date().toISOString() },
        ],
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(WATER_KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: WATER_KEY }),
  });
}

export function useWeightHistory(days = 30) {
  return useQuery({
    queryKey: [...WEIGHT_KEY, days],
    queryFn: async () =>
      parseWith(WeightListSchema, await apiFetch(`/weight?days=${days}`), 'weight:list'),
  });
}

export function useUpsertWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kg: number; note?: string }) =>
      parseWith(
        WeightEntrySchema,
        await apiFetch('/weight', { method: 'PUT', body: JSON.stringify(input) }),
        'weight:upsert',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WEIGHT_KEY });
      // A weigh-in is half of what the adaptive targets are measured from.
      qc.invalidateQueries({ queryKey: ['goals', 'adaptive'] });
    },
  });
}

export function useProgressSummary(days = 7) {
  return useQuery({
    queryKey: [...PROGRESS_KEY, days],
    queryFn: async () =>
      parseWith(
        ProgressSummaryResponseSchema,
        await apiFetch(`/progress/summary?days=${days}`),
        'progress:summary',
      ),
  });
}
