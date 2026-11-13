import { describe, expect, it } from 'vitest';
import type { BodyEntry } from './api';
import { latestBodyWeight, movingAverage, signedKg, waistTrend, weekAverages, weekStart, weightCheck } from './body';

/** Weighings Monday, Wednesday, Friday of the week starting at monday, all with the same weight. */
function week(monday: string, weight: number): BodyEntry[] {
  return [0, 2, 4].map((offset) => ({
    date: new Date(Date.parse(monday) + offset * 86_400_000).toISOString().slice(0, 10),
    weight,
    waist: null,
  }));
}

describe('weekStart', () => {
  it('returns the Monday', () => {
    expect(weekStart('2026-11-13')).toBe('2026-11-09');   // Friday
    expect(weekStart('2026-11-09')).toBe('2026-11-09');   // Monday
    expect(weekStart('2026-11-15')).toBe('2026-11-09');   // Sunday
  });
});

describe('weekAverages and latestBodyWeight', () => {
  it('averages per week and finds the newest weight', () => {
    const body = [...week('2026-10-26', 96), { date: '2026-11-02', weight: 95, waist: 104 }, { date: '2026-11-03', weight: 95.4, waist: null }];
    expect(weekAverages(body)).toEqual([
      { start: '2026-10-26', average: 96, count: 3 },
      { start: '2026-11-02', average: 95.2, count: 2 },
    ]);
    expect(latestBodyWeight(body)).toBe(95.4);
    expect(latestBodyWeight(body, '2026-11-02')).toBe(95);
    expect(latestBodyWeight([])).toBeNull();
  });
});

describe('weightCheck', () => {
  it('needs 3 weighings in week X and in week X−2', () => {
    expect(weightCheck([...week('2026-10-26', 96), ...week('2026-11-02', 95.5)], -0.5, '2026-11-13')).toBeNull();
  });

  it('on track when losing about 1 kg in 2 weeks with target −0.5', () => {
    const body = [...week('2026-10-26', 96), ...week('2026-11-02', 95.5), ...week('2026-11-09', 95)];
    const check = weightCheck(body, -0.5, '2026-11-13');
    expect(check?.status).toBe('onTrack');
    expect(check?.change).toBe(-1);
    expect(check?.expected).toBe(-1);
    expect(check?.text).toBe('Du liegst im Plan.');
    expect(check?.advice).toBe('');
  });

  it('too slow once: only a hint, no advice', () => {
    const body = [...week('2026-10-26', 96), ...week('2026-11-02', 96), ...week('2026-11-09', 95.8)];
    const check = weightCheck(body, -0.5, '2026-11-13');
    expect(check?.status).toBe('tooSlow');
    expect(check?.text).toBe('Du nimmst langsamer ab als geplant.');
    expect(check?.advice).toMatch(/^Einzelne Wochen schwanken/);
  });

  it('too slow twice in a row: fewer calories, carbohydrates first', () => {
    const body = [...week('2026-10-19', 96), ...week('2026-10-26', 96), ...week('2026-11-02', 96), ...week('2026-11-09', 95.9)];
    const check = weightCheck(body, -0.5, '2026-11-13');
    expect(check?.status).toBe('tooSlow');
    expect(check?.advice).toMatch(/senken, zuerst bei den Kohlenhydraten/);
  });

  it('too fast twice in a row: more calories', () => {
    const body = [...week('2026-10-19', 98), ...week('2026-10-26', 97), ...week('2026-11-02', 96), ...week('2026-11-09', 95)];
    const check = weightCheck(body, -0.5, '2026-11-13');
    expect(check?.status).toBe('tooFast');
    expect(check?.text).toBe('Du nimmst schneller ab als geplant.');
    expect(check?.advice).toMatch(/erhöhen/);
  });

  it('works for gaining and holding', () => {
    const gain = [...week('2026-10-26', 80), ...week('2026-11-02', 80.2), ...week('2026-11-09', 80.1)];
    expect(weightCheck(gain, 0.5, '2026-11-13')?.text).toBe('Du nimmst langsamer zu als geplant.');
    const hold = [...week('2026-10-26', 80), ...week('2026-11-02', 80.5), ...week('2026-11-09', 81)];
    expect(weightCheck(hold, 0, '2026-11-13')?.text).toBe('Du nimmst zu, Ziel ist Halten.');
  });

  it('falls back to the last complete comparison when the running week has too few weighings', () => {
    const body = [...week('2026-10-19', 97), ...week('2026-10-26', 96.5), ...week('2026-11-02', 96), { date: '2026-11-09', weight: 95.8, waist: null }];
    expect(weightCheck(body, -0.5, '2026-11-10')?.week.start).toBe('2026-11-02');
  });
});

describe('movingAverage, waistTrend, signedKg', () => {
  it('averages the last 7 days', () => {
    const body = [{ date: '2026-11-01', weight: 96, waist: null }, { date: '2026-11-05', weight: 95, waist: null },
      { date: '2026-11-09', weight: 94, waist: null }];
    expect(movingAverage(body)).toEqual([
      { date: '2026-11-01', value: 96 }, { date: '2026-11-05', value: 95.5 }, { date: '2026-11-09', value: 94.5 },
    ]);
  });

  it('compares the waist with the measurement about 4 weeks earlier', () => {
    const body = [{ date: '2026-10-12', weight: null, waist: 106 }, { date: '2026-10-26', weight: null, waist: 105 },
      { date: '2026-11-09', weight: null, waist: 104 }];
    expect(waistTrend(body)).toEqual({ latest: 104, date: '2026-11-09', change: -2 });
    expect(waistTrend([])).toBeNull();
  });

  it('formats signed values', () => {
    expect(signedKg(-1.04)).toBe('−1 kg');
    expect(signedKg(0.35)).toBe('+0,4 kg');
    expect(signedKg(0)).toBe('±0 kg');
  });
});
