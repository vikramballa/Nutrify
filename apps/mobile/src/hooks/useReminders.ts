import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MealTimesResponseSchema } from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';
import {
  remindersEnabled,
  rescheduleFrom,
  setRemindersEnabled,
} from '../notifications/reminders';
import type { LogSample } from '../notifications/schedule';

/** Meal timestamps, converted to the local hour-of-day the reminders use. */
function useMealSamples() {
  return useQuery({
    queryKey: ['logs', 'times'],
    queryFn: async () => {
      const data = parseWith(
        MealTimesResponseSchema,
        await apiFetch('/logs/times'),
        'logs/times',
      );
      return data.times.map<LogSample>((t) => {
        const d = new Date(t.at);
        return { mealType: t.mealType, hour: d.getHours() + d.getMinutes() / 60 };
      });
    },
    staleTime: 60 * 60_000, // eating habits do not move hour to hour
  });
}

/**
 * Owns the reminder switch and keeps the schedule in step with how the user
 * actually eats. Rescheduling on every launch is what makes the times drift
 * toward reality instead of being frozen at whatever they were on day one.
 */
export function useReminders() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const samples = useMealSamples();

  useEffect(() => {
    void remindersEnabled().then((on) => {
      setEnabled(on);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !enabled || !samples.data) return;
    void rescheduleFrom(samples.data);
  }, [ready, enabled, samples.data]);

  const toggle = useCallback(
    async (on: boolean) => {
      // The OS may refuse (permission denied); trust the returned state, not
      // the requested one, so the switch can never lie about being on.
      const result = await setRemindersEnabled(on, samples.data ?? []);
      setEnabled(result);
      return result;
    },
    [samples.data],
  );

  return { enabled, ready, toggle };
}
