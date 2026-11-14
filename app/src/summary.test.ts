import { describe, expect, it } from 'vitest';
import type { SavePayload, State } from './api';
import { buildSummary, funComparison, FUN_UNITS } from './summary';

const state: State = {
  apiVersion: '1.4.0',
  days: [],
  exercises: [
    { id: 'E01', name: 'Kniebeuge', muscleGroup: 'Quadrizeps', type: 'Grundübung', repsMin: 5, repsMax: 8,
      increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: 20 },
    { id: 'E08', name: 'Kabel-Fliegende', muscleGroup: 'Brust', type: 'Isolation', repsMin: 10, repsMax: 15,
      increment: 1.25, weightType: 'pro Seite', active: true, note: '', barWeight: null },
  ],
  history: {
    E01: { lastSession: { date: '2026-11-09', sets: [{ set: 1, kg: 70, reps: 6, failure: false }] }, bestE1rm: 84, bestRepsAtZero: 0 },
    E08: { lastSession: { date: '2026-11-08', sets: [{ set: 1, kg: 20, reps: 7, failure: false }] }, bestE1rm: 24.67, bestRepsAtZero: 0 },
  },
};

const payload = (deload = false): SavePayload => ({
  clientId: 'x', day: 'Beine', date: '2026-11-13', deload, note: '',
  exercises: [
    { id: 'E01', kg: 72.5, reps: [6, 6, 5, null], failure: false },     // 72,5 × 6 = e1RM 87 > 84: record
    { id: 'E08', kg: 17.5, reps: [10, 10, null, null], failure: false },   // 23,3 < 24,67: no record
  ],
});

describe('buildSummary', () => {
  it('lists the sets with e1RM and sums the volume', () => {
    const summary = buildSummary(payload(), state);
    expect(summary.volume).toBe(72.5 * 17 + 17.5 * 20);
    expect(summary.exercises.map((e) => e.name)).toEqual(['Kniebeuge', 'Kabel-Fliegende']);
    expect(summary.exercises[0].sets.map((s) => [s.set, s.kg, s.reps, Math.round(s.e1rm)])).toEqual(
      [[1, 72.5, 6, 87], [2, 72.5, 6, 87], [3, 72.5, 5, 85]]);
  });
  it('counts one PR per exercise and marks its best set', () => {
    const summary = buildSummary(payload(), state);
    expect(summary.prCount).toBe(1);
    expect(summary.exercises[0].sets.filter((s) => s.isPr).map((s) => s.set)).toEqual([1]);
    expect(summary.exercises[1].sets.some((s) => s.isPr)).toBe(false);
  });
  it('added weight: 1RM with body weight, volume with the added weight only', () => {
    const withPullUps: State = {
      ...state,
      exercises: [...state.exercises, { id: 'E30', name: 'Klimmzüge', muscleGroup: 'Rücken', type: 'Grundübung',
        repsMin: 6, repsMax: 10, increment: 2.5, weightType: 'Zusatzgewicht', active: true, note: '', barWeight: null }],
      body: [{ date: '2026-11-12', weight: 90, waist: null }],
    };
    const summary = buildSummary({ ...payload(), exercises: [{ id: 'E30', kg: 0, reps: [6, null, null, null], failure: false }] },
      withPullUps);
    expect(Math.round(summary.exercises[0].sets[0].e1rm)).toBe(108);      // 90 × (1 + 6/30)
    expect(summary.volume).toBe(0);
  });
  it('no PRs in a deload training', () => {
    expect(buildSummary(payload(true), state).prCount).toBe(0);
  });
});

describe('funComparison', () => {
  it('uses the dative plural and a sensible count', () => {
    expect(funComparison(1452.5, () => 0)).toBe('Das bewegte Gewicht entspricht 6,6 Tigern. 🐯');
    expect(funComparison(10110, () => 0)).toBe('Das bewegte Gewicht entspricht 46 Tigern. 🐯');
  });
  it('never picks a unit that gives less than 2', () => {
    for (let i = 0; i < 100; i++) {
      const text = funComparison(300, Math.random);
      expect(text).not.toMatch(/Blauwal|Nilpferd|Kleinwagen|ausgewachsenen/);
    }
  });
  it('big numbers with thousands separator', () => {
    // 400 t: every unit fits, so the index into FUN_UNITS is the index of the pick
    const gummy = FUN_UNITS.findIndex((u) => u.dative === 'Gummibärchen');
    const pick = () => (gummy + 0.5) / FUN_UNITS.length;
    expect(funComparison(400000, pick)).toBe('Das bewegte Gewicht entspricht 200.000.000 Gummibärchen. 🐻');
  });
  it('nothing moved', () => {
    expect(funComparison(0)).toContain('Luft');
  });
});

describe('summaryFromDetail', () => {
  it('sums volume and counts the records marked by the web API', async () => {
    const { summaryFromDetail } = await import('./summary');
    const summary = summaryFromDetail({
      date: '2026-11-08', day: 'Push', deload: false, note: '',
      exercises: [{ id: 'E06', name: 'Multipresse', sets: [
        { set: 1, kg: 40, reps: 8, failure: false, e1rm: 50.7, isPr: true },
        { set: 2, kg: 40, reps: 7, failure: false, e1rm: 49.3, isPr: false },
      ] }],
    });
    expect(summary.volume).toBe(600);
    expect(summary.prCount).toBe(1);
    expect(summary.exercises[0].sets[0]).toEqual({ set: 1, kg: 40, reps: 8, e1rm: 50.7, isPr: true });
  });
});
