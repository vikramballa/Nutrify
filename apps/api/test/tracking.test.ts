import { describe, it, expect } from 'vitest';
import {
  resolveDay,
  dayRange,
  computeDailyTotals,
  adherenceScore,
} from '../src/services/tracking.js';

const NOW = new Date('2026-07-19T15:30:00.000Z'); // a Sunday

describe('resolveDay', () => {
  it('defaults to today at UTC midnight', () => {
    expect(resolveDay(undefined, NOW)?.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });

  it('parses a valid day key', () => {
    expect(resolveDay('2026-07-01', NOW)?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rejects malformed or overflowing dates', () => {
    expect(resolveDay('2026-02-31', NOW)).toBeNull();
    expect(resolveDay('yesterday', NOW)).toBeNull();
  });
});

describe('dayRange', () => {
  it('returns N consecutive day keys ending today', () => {
    const r = dayRange(7, NOW);
    expect(r.days).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    expect(r.start.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('crosses month boundaries', () => {
    const r = dayRange(3, new Date('2026-08-01T10:00:00.000Z'));
    expect(r.days).toEqual(['2026-07-30', '2026-07-31', '2026-08-01']);
  });
});

describe('computeDailyTotals', () => {
  const days = ['2026-07-18', '2026-07-19'];

  it('sums macros per day; logs outside the range are ignored', () => {
    const totals = computeDailyTotals(days, [
      { at: new Date('2026-07-18T08:00:00.000Z'), calories: 400, protein: 20, carbs: 40, fat: 10 },
      { at: new Date('2026-07-18T19:30:00.000Z'), calories: 600, protein: 30, carbs: 60, fat: 20 },
      { at: new Date('2026-07-19T12:00:00.000Z'), calories: 250, protein: 10, carbs: 25, fat: 8 },
      { at: new Date('2026-07-17T23:00:00.000Z'), calories: 999, protein: 9, carbs: 9, fat: 9 },
    ]);
    expect(totals).toEqual([
      { date: '2026-07-18', calories: 1000, protein: 50, carbs: 100, fat: 30 },
      { date: '2026-07-19', calories: 250, protein: 10, carbs: 25, fat: 8 },
    ]);
  });

  it('emits zeroed days even with no logs', () => {
    expect(computeDailyTotals(days, [])).toEqual([
      { date: '2026-07-18', calories: 0, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-07-19', calories: 0, protein: 0, carbs: 0, fat: 0 },
    ]);
  });
});

describe('adherenceScore', () => {
  const goals = { calories: 2000, protein: 120, carbs: 200, fat: 65 };
  const day = (date: string, m: Partial<typeof goals> = {}) => ({
    date,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ...m,
  });

  it('scores a day that hits every target at 100', () => {
    expect(adherenceScore([day('2026-07-13', goals)], goals)).toBe(100);
  });

  it('ignores unlogged days instead of scoring them zero', () => {
    const week = [day('2026-07-13', goals), day('2026-07-14'), day('2026-07-15')];
    expect(adherenceScore(week, goals)).toBe(100);
  });

  it('returns 0 when nothing was logged all week', () => {
    expect(adherenceScore([day('2026-07-13'), day('2026-07-14')], goals)).toBe(0);
  });

  it('penalises over- and under-shooting a target equally', () => {
    const under = adherenceScore([day('2026-07-13', { ...goals, calories: 1000 })], goals);
    const over = adherenceScore([day('2026-07-13', { ...goals, calories: 3000 })], goals);
    expect(under).toBe(over);
    expect(under).toBe(88); // one of four macros at half credit
  });

  it('floors a macro that is more than a full target away', () => {
    const wild = adherenceScore([day('2026-07-13', { ...goals, protein: 400 })], goals);
    expect(wild).toBe(75); // that macro scores 0, the other three score 1
  });
});
