import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdaptiveGoalsResponseSchema,
  ProfileResponseSchema,
  type ProfileInput,
  type ProfileResponse,
} from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => parseWith(ProfileResponseSchema, await apiFetch('/profile'), 'profile'),
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileInput) =>
      parseWith(
        ProfileResponseSchema,
        await apiFetch('/profile', {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
        'profile:save',
      ),
    onSuccess: (data: ProfileResponse) => {
      queryClient.setQueryData(['profile'], data);
    },
  });
}

/** Targets recalibrated from logged intake vs weight trend. */
export function useAdaptiveGoals(enabled: boolean) {
  return useQuery({
    queryKey: ['goals', 'adaptive'],
    queryFn: async () =>
      parseWith(AdaptiveGoalsResponseSchema, await apiFetch('/goals/adaptive'), 'goals:adaptive'),
    enabled,
    staleTime: 60 * 60_000, // moves with days of data, not minutes
  });
}

export function useApplyAdaptiveGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      parseWith(
        ProfileResponseSchema,
        await apiFetch('/goals/adaptive/apply', { method: 'POST' }),
        'goals:adaptive:apply',
      ),
    onSuccess: (data: ProfileResponse) => {
      queryClient.setQueryData(['profile'], data);
      queryClient.invalidateQueries({ queryKey: ['goals', 'adaptive'] });
    },
  });
}
