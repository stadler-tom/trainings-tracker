import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseHistory, LoggedSet } from './api';
import {
  checkRecord, daysDoneToday, daysForToday, usualWeekday, e1rm, formatNumber, lastText, platesPerSide, stepValue, targetToday, warmUpSets,
} from './training';

const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function exercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: 'E00', name: 'Test', muscleGroup: 'Brust', type: 'Isolation', repsMin: 8, repsMax: 12,
    increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: null, ...overrides,
  };
}

function history(kg: number, reps: number[], best?: { e1rm?: number; repsAtZero?: number; kgAtMin?: number | null }): ExerciseHistory {
  const sets: LoggedSet[] = reps.map((r, i) => ({ set: i + 1, kg, reps: r, failure: false }));
  return {
    lastSession: { date: '2026-11-04', sets },
    bestE1rm: best?.e1rm ?? Math.max(...reps.map((r) => e1rm(kg, r))),
    bestRepsAtZero: best?.repsAtZero ?? 0,
    bestKgAtMin: best?.kgAtMin === undefined ? kg : best.kgAtMin,
  };
}

// exercises as in the template (api/Setup.gs)
const squat = exercise({ id: 'E01', type: 'Grundübung', repsMin: 5, repsMax: 8, increment: 2.5, barWeight: 20 });
const smithIncline = exercise({ id: 'E06', type: 'Grundübung', repsMin: 6, repsMax: 10, increment: 2.5, barWeight: 0 });
const cableFly = exercise({ id: 'E08', repsMin: 10, repsMax: 15, increment: 1.25, weightType: 'pro Seite' });
const pullUp = exercise({ id: 'E30', repsMin: 6, repsMax: 10, increment: 2.5, weightType: 'Zusatzgewicht' });

describe('formatNumber', () => {
  it('uses a decimal comma and drops trailing zeros', () => {
    expect(formatNumber(26.25)).toBe('26,25');
    expect(formatNumber(40)).toBe('40');
    expect(formatNumber(17.5)).toBe('17,5');
  });
});

describe('targetToday – acceptance cases with the start data', () => {
  it('Multipresse 40 × 8/8/8 → = 40 kg · 9+', () => {
    expect(targetToday(smithIncline, history(40, [8, 8, 8]), false).text).toBe('= 40 kg · 9+');
  });
  it('Kabel-Fliegende 20 × 6/6/6/6 → ↓ 17,5 kg · 10+', () => {
    expect(targetToday(cableFly, history(20, [6, 6, 6, 6]), false).text).toBe('↓ 17,5 kg · 10+');
  });
  it('Kniebeuge 70 × 6/6/6 → = 70 kg · 7+', () => {
    const target = targetToday(squat, history(70, [6, 6, 6]), false);
    expect(target.text).toBe('= 70 kg · 7+');
    expect(target.kg).toBe(70);
    expect(target.reps).toBe(7);
  });
});

describe('targetToday – rules 1 to 4', () => {
  it('rule 1: no data', () => {
    const target = targetToday(cableFly, undefined, false);
    expect(target.text).toBe('neu · 10–15 Wdh');
    expect(target.kg).toBeNull();
  });
  it('rule 2: set 1 at reps max and all sets at least reps min → increase', () => {
    const target = targetToday(smithIncline, history(40, [10, 9, 8]), false);
    expect(target.text).toBe('↑ 42,5 kg · 6+');
    expect(target.kg).toBe(42.5);
  });
  it('rule 2 does not apply if a later set is below reps min', () => {
    expect(targetToday(smithIncline, history(40, [10, 7, 5]), false).text).toBe('= 40 kg · 10+');
  });
  it('rule 3 only when set 1 is more than 2 below reps min', () => {
    expect(targetToday(cableFly, history(20, [8, 7, 6]), false).text).toBe('= 20 kg · 9+');
    expect(targetToday(cableFly, history(20, [7, 6, 6]), false).kind).toBe('down');
  });
  it('rule 3 never goes below one increment', () => {
    expect(targetToday(cableFly, history(1.25, [2]), false).text).toBe('↓ 1,25 kg · 10+');
  });
  it('rule 4: reps goal is capped at reps max', () => {
    expect(targetToday(squat, history(70, [8, 6, 4]), false).text).toBe('= 70 kg · 8+');
  });
  it('uses set 1 even if sets arrive unordered', () => {
    const h = history(40, [8, 8, 8]);
    h.lastSession!.sets.reverse();
    expect(targetToday(smithIncline, h, false).text).toBe('= 40 kg · 9+');
  });
});

describe('targetToday – special cases', () => {
  it('added weight 0 kg never decreases', () => {
    expect(targetToday(pullUp, history(0, [3, 3, 2]), false).text).toBe('= 0 kg · 4+');
  });
  it('no increment never decreases', () => {
    const noStep = exercise({ increment: 0, repsMin: 10, repsMax: 15 });
    expect(targetToday(noStep, history(10, [3]), false).kind).toBe('same');
  });
  it('warm-up exercises get no target text', () => {
    const warmUp = exercise({ type: 'Aufwärmen' });
    const target = targetToday(warmUp, history(5, [15]), false);
    expect(target.kind).toBe('warmUp');
    expect(target.text).toBe('');
    expect(target.kg).toBe(5);
  });
  it('deload: same weight, half the sets', () => {
    expect(targetToday(cableFly, history(20, [6, 6, 6, 6]), true).text).toBe('Deload 20 kg · 2 Sätze');
    expect(targetToday(squat, history(70, [6, 6, 6]), true).text).toBe('Deload 70 kg · 2 Sätze');
  });
});

describe('lastText', () => {
  it('shows date, weight and reps', () => {
    expect(lastText(history(40, [8, 8, 7]))).toBe('zuletzt 4.11. 40 × 8/8/7');
    expect(lastText(undefined)).toBeNull();
  });
});

describe('checkRecord', () => {
  const h = history(70, [6, 6, 6]); // squat 5–8 Wdh, heaviest weight with 5+ reps: 70 kg
  it('a heavier weight with the minimum reps is a record', () => {
    const result = checkRecord(squat, h, 72.5, 5, false);
    expect(result.isRecord).toBe(true);
    expect(result.kind).toBe('weight');
    expect(result.text).toBe('Neuer Rekord: 72,5 kg × 5 (+2,5 kg)');
  });
  it('a heavier weight below the minimum reps is no record', () => {
    expect(checkRecord(squat, h, 72.5, 4, false).isRecord).toBe(false);
  });
  it('more reps at the same weight are no record', () => {
    expect(checkRecord(squat, h, 70, 8, false).isRecord).toBe(false);
  });
  it('example from the request: 5 reps at the new weight, a week later 6 reps', () => {
    const before = history(80, [8, 8, 8]);
    const legPress = { ...squat, repsMin: 6 };
    expect(checkRecord(legPress, before, 82.5, 5, false).isRecord).toBe(false);
    // the 5-rep session does not raise the best weight, the next one with 6 reps is the record
    const after = history(82.5, [5, 5, 4], { kgAtMin: 80 });
    expect(checkRecord(legPress, after, 82.5, 6, false).isRecord).toBe(true);
  });
  it('no record in deload sessions', () => {
    expect(checkRecord(squat, h, 100, 6, true).isRecord).toBe(false);
  });
  it('no record for the first session of an exercise', () => {
    expect(checkRecord(squat, undefined, 100, 6, false).isRecord).toBe(false);
  });
  it('added weight compares the added weight, reps at body weight are no record', () => {
    const ph = history(5, [6], { repsAtZero: 10 });
    expect(checkRecord(pullUp, ph, 7.5, 6, false).text).toBe('Neuer Rekord: Körpergewicht + 7,5 kg × 6 (+2,5 kg)');
    expect(checkRecord(pullUp, ph, 0, 12, false).isRecord).toBe(false);
  });
  it('empty reps is no record', () => {
    expect(checkRecord(squat, h, 100, 0, false).isRecord).toBe(false);
  });
  it('the first time the minimum reps are reached is the baseline, no record', () => {
    expect(checkRecord(cableFly, history(20, [7, 7], { kgAtMin: null }), 16.25, 10, false).isRecord).toBe(false);
  });
});

describe('platesPerSide', () => {
  it('72,5 kg with a 20 kg bar → 25 + 1,25 per side', () => {
    const load = platesPerSide(72.5, 20, DEFAULT_PLATES);
    expect(load.perSide).toEqual([25, 1.25]);
    expect(load.missing).toBe(0);
  });
  it('without 25 kg plates → 20 + 5 + 1,25', () => {
    expect(platesPerSide(72.5, 20, [20, 15, 10, 5, 2.5, 1.25]).perSide).toEqual([20, 5, 1.25]);
  });
  it('bar weight 0 (Smith machine) counts plates only', () => {
    expect(platesPerSide(40, 0, DEFAULT_PLATES).perSide).toEqual([20]);
  });
  it('not exactly reachable → next lower load and difference', () => {
    const load = platesPerSide(73, 20, DEFAULT_PLATES);
    expect(load.perSide).toEqual([25, 1.25]);
    expect(load.loadedTotal).toBe(72.5);
    expect(load.missing).toBe(0.5);
  });
  it('weight below the bar → empty bar', () => {
    const load = platesPerSide(15, 20, DEFAULT_PLATES);
    expect(load.perSide).toEqual([]);
    expect(load.missing).toBe(-5);
  });
});

describe('warmUpSets', () => {
  it('Kniebeuge at 70 kg → 35 × 8, 47,5 × 4, 57,5 × 2', () => {
    expect(warmUpSets(squat, 70)).toEqual([{ kg: 35, reps: 8 }, { kg: 47.5, reps: 4 }, { kg: 57.5, reps: 2 }]);
  });
  it('never below the bar weight', () => {
    expect(warmUpSets(squat, 30)[0].kg).toBe(20);
  });
  it('none without target weight or for other types', () => {
    expect(warmUpSets(squat, null)).toEqual([]);
    expect(warmUpSets(cableFly, 20)).toEqual([]);
  });
});

describe('stepValue', () => {
  it('steps from the current value without rounding to a grid', () => {
    expect(stepValue(41, 2.5, 1)).toBe(43.5);
    expect(stepValue(17.5, 1.25, -1)).toBe(16.25);
    expect(stepValue(null, 1, 1)).toBe(1);
  });
  it('never below 0', () => {
    expect(stepValue(1, 2.5, -1)).toBe(0);
  });
});

describe('usualWeekday / daysForToday', () => {
  const day = (name: string, recentDates: string[] | undefined, lastDate: string | null = recentDates?.[0] ?? null) =>
    ({ name, lastDate, recentDates, exerciseIds: [] });
  // Tom's split: Beine Monday, Push Wednesday, Pull Friday, Upper Sunday
  const days = [
    day('Beine', ['2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19']),
    day('Push', ['2026-11-11', '2026-11-05', '2026-10-28', '2026-10-21']),   // one training moved to Thursday
    day('Pull', ['2026-11-13', '2026-11-06']),
    day('Upper', ['2026-11-08']),
    day('Neu', []),
  ];
  it('majority of the recent trainings decides', () => {
    expect(usualWeekday(days[0])).toBe(1);
    expect(usualWeekday(days[1])).toBe(3);
  });
  it('tie: the older weekday stays (one moved training does not move the hint)', () => {
    expect(usualWeekday(day('X', ['2026-11-13', '2026-11-04']))).toBe(3);        // Fri moved, Wed stays
    expect(usualWeekday(day('X', ['2026-11-20', '2026-11-13', '2026-11-11', '2026-11-04']))).toBe(3);
    expect(usualWeekday(day('X', ['2026-11-27', '2026-11-20', '2026-11-13', '2026-11-04']))).toBe(5); // 3 of 4: moved
  });
  it('no trainings: no weekday', () => {
    expect(usualWeekday(days[4])).toBeNull();
  });
  it('older web API without recentDates uses lastDate', () => {
    expect(usualWeekday(day('Pull', undefined, '2026-11-13'))).toBe(5);
  });
  it('marks the day of today', () => {
    expect(daysForToday(days, new Date(2026, 10, 18))).toEqual(['Push']);      // Wednesday
    expect(daysForToday(days, new Date(2026, 10, 15))).toEqual(['Upper']);     // Sunday
    expect(daysForToday(days, new Date(2026, 10, 17))).toEqual([]);            // Tuesday: rest day
  });
});

describe('daysDoneToday', () => {
  it('a day is done when its newest training is today', () => {
    const days = [
      { name: 'Pull', lastDate: '2026-11-13', exerciseIds: [] },
      { name: 'Push', lastDate: '2026-11-11', exerciseIds: [] },
      { name: 'Neu', lastDate: null, exerciseIds: [] },
    ];
    expect(daysDoneToday(days, '2026-11-13')).toEqual(['Pull']);
    expect(daysDoneToday(days, '2026-11-14')).toEqual([]);
  });
});

