import { describe, it, expect } from 'vitest';
import { computeStreak } from '../src/services/streak.js';

const TODAY = '2026-08-22';

/** `n` days back from TODAY, as a UTC day key. */
function ago(n: number): string {
  const d = new Date(Date.UTC(2026, 7, 22));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('computeStreak', () => {
  it('is empty with no logs', () => {
    const s = computeStreak([], TODAY);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(0);
    expect(s.loggedToday).toBe(false);
  });

  it('counts consecutive days ending today', () => {
    const s = computeStreak([ago(0), ago(1), ago(2)], TODAY);
    expect(s.current).toBe(3);
    expect(s.loggedToday).toBe(true);
  });

  it('keeps the run alive when today has no log yet', () => {
    // The day is not over; an unlogged today must not reset yesterday's work.
    const s = computeStreak([ago(1), ago(2), ago(3)], TODAY);
    expect(s.current).toBe(3);
    expect(s.loggedToday).toBe(false);
    expect(s.forgiving).toBe(false);
  });

  it('forgives a single missed day and flags it', () => {
    // Logged today and 2-4 days ago; day 1 was missed.
    const s = computeStreak([ago(0), ago(2), ago(3), ago(4)], TODAY);
    expect(s.current).toBe(4);
    expect(s.forgiving).toBe(false); // the miss is behind a logged day
  });

  it('marks the run as forgiving while a gap is the most recent thing', () => {
    // Nothing today, nothing yesterday, logged the three days before that.
    const s = computeStreak([ago(2), ago(3), ago(4)], TODAY);
    expect(s.current).toBe(3);
    expect(s.forgiving).toBe(true);
  });

  it('resets after two consecutive missed days', () => {
    const s = computeStreak([ago(3), ago(4), ago(5)], TODAY);
    expect(s.current).toBe(0);
  });

  it('remembers the longest historical run', () => {
    const old = [ago(20), ago(21), ago(22), ago(23), ago(24)];
    const s = computeStreak([...old, ago(0)], TODAY);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(5);
  });

  it('reports the current run as longest when it beats history', () => {
    const s = computeStreak([ago(0), ago(1), ago(2), ago(20)], TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('ignores duplicate day keys', () => {
    const s = computeStreak([ago(0), ago(0), ago(1)], TODAY);
    expect(s.current).toBe(2);
  });

  it('returns Monday..Sunday dots for the current week', () => {
    // 2026-08-22 is a Saturday, so the week runs 2026-08-17..2026-08-23.
    const s = computeStreak([ago(0)], TODAY);
    expect(s.week).toHaveLength(7);
    expect(s.week[0].date).toBe('2026-08-17');
    expect(s.week[6].date).toBe('2026-08-23');
    expect(s.week[5]).toEqual({ date: TODAY, logged: true });
  });
});
