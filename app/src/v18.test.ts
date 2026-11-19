// Version 1.8: day plan (weekdays, number of sets), weight per set, "Eingeschränkt".
import { describe, expect, it } from 'vitest';
import type { Exercise, State } from './api';
import { buildPayload, newDraft, newItem, type Draft } from './draft';
import { buildSummary } from './summary';
import { dayLabel, daysForToday, lastText, perSetText, sortDaysByWeekday, targetPerSet } from './training';

const bench: Exercise = { id: 'E06', name: 'Bankdrücken', muscleGroup: 'Brust', type: 'Grundübung', repsMin: 6, repsMax: 10,
  increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: 20 };
const history = {
  lastSession: { date: '2026-11-16', sets: [
    { set: 1, kg: 80, reps: 10, failure: false }, { set: 2, kg: 77.5, reps: 9, failure: false }, { set: 3, kg: 77.5, reps: 7, failure: true }] },
  bestE1rm: 106.7, bestRepsAtZero: 0,
};
const state = (perSetWeight: boolean): State => ({
  apiVersion: '1.8.0', perSetWeight, exercises: [bench], history: { E06: history },
  days: [{ name: 'Push', lastDate: '2026-11-16', exerciseIds: ['E06'], weekdays: [1, 3], slots: [{ id: 'E06', sets: 3 }] }],
});

describe('sortDaysByWeekday', () => {
  const day = (name: string, weekdays?: number[]) => ({ name, lastDate: null, recentDates: [], exerciseIds: [], weekdays });
  it('sorts by the earliest weekday, Monday first; days without weekday last in tab order', () => {
    const days = [day('Pull', [5]), day('Extra'), day('Upper', [7]), day('Push', [3, 1]), day('Beine', [1]), day('Mobility', [])];
    expect(sortDaysByWeekday(days as never).map((d) => d.name)).toEqual(['Push', 'Beine', 'Pull', 'Upper', 'Extra', 'Mobility']);
  });
});

describe('day plan', () => {
  it('number of sets from the day sheet', () => {
    expect(newDraft(state(false), 'Push', '2026-11-18').items[0].reps).toEqual(['', '', '']);
  });
  it('weekdays in the label and for the today frame', () => {
    expect(dayLabel(state(false).days[0])).toBe('Push (Mo, Mi)');
    expect(dayLabel({ name: 'Beine', lastDate: null, exerciseIds: [] })).toBe('Beine');
    expect(daysForToday(state(false).days, new Date(2026, 10, 18))).toEqual(['Push']);    // Wednesday
    expect(daysForToday(state(false).days, new Date(2026, 10, 19))).toEqual([]);          // Thursday
  });
  it('without weekdays the usual weekday from the log still counts', () => {
    const days = [{ name: 'Beine', lastDate: '2026-11-16', recentDates: ['2026-11-16', '2026-11-09'], exerciseIds: [], weekdays: [] }];
    expect(daysForToday(days, new Date(2026, 10, 23))).toEqual(['Beine']);                 // Monday
  });
});

describe('weight per set', () => {
  it('double progression per set: only a set at reps max goes up', () => {
    expect(targetPerSet(bench, history, 4, false)).toEqual([
      { kg: 82.5, reps: 6, up: true }, { kg: 77.5, reps: 10, up: false }, { kg: 77.5, reps: 8, up: false }, { kg: 77.5, reps: 8, up: false }]);
    expect(perSetText(targetPerSet(bench, history, 3, false))).toBe('↑ Satz 1: 82,5 kg · Satz 2–3: 77,5 kg');
  });
  it('deload: same weights, no increase', () => {
    expect(targetPerSet(bench, history, 2, true).map((t) => t.kg)).toEqual([80, 77.5]);
  });
  it('prefills one weight per set in mode "Gewicht pro Satz"', () => {
    expect(newItem(state(true), 'E06', false, 3).kgs).toEqual(['82,5', '77,5', '77,5']);
    expect(newItem(state(false), 'E06', false, 3).kgs).toEqual(['82,5', '82,5', '82,5']);   // rule 2 for all sets
  });
  it('payload with the weight of each set; a missing one points to its field', () => {
    const draft: Draft = { ...newDraft(state(true), 'Push', '2026-11-18') };
    draft.items[0].reps = ['8', '9', '10'];
    draft.items[0].kgs = ['82,5', '77,5', '75'];
    const result = buildPayload(draft);
    expect('payload' in result && result.payload.exercises[0].sets).toEqual([{ kg: 82.5, reps: 8 }, { kg: 77.5, reps: 9 }, { kg: 75, reps: 10 }]);
    draft.items[0].kgs = ['82,5', '', '75'];
    expect(buildPayload(draft)).toMatchObject({ itemIndex: 0, field: 'kg-1' });
  });
  it('lastText shows different weights', () => {
    expect(lastText(history)).toBe('zuletzt 16.11. 80/77,5/77,5 × 10/9/7');
  });
});

describe('Eingeschränkt', () => {
  const limitedDraft = (reason: string) => {
    const draft = newDraft(state(false), 'Push', '2026-11-18');
    draft.items[0] = { ...draft.items[0], kg: '90', reps: ['8', '3', ''], limited: true, reason };
    return draft;
  };
  it('sends the reason, or an empty one', () => {
    const r1 = buildPayload(limitedDraft(' Schulter links '));
    expect('payload' in r1 && r1.payload.exercises[0].limited).toBe('Schulter links');
    const r2 = buildPayload(limitedDraft(''));
    expect('payload' in r2 && r2.payload.exercises[0].limited).toBe('');
  });
  it('is never a record in the summary, still counts for the volume', () => {
    const result = buildPayload(limitedDraft('Knie'));
    if (!('payload' in result)) throw new Error('no payload');
    const summary = buildSummary(result.payload, state(false));      // 90 × 8 would beat the best e1RM
    expect(summary.prCount).toBe(0);
    expect(summary.volume).toBe(90 * 11);
    expect(summary.exercises[0].limited).toBe('Knie');
  });
});
