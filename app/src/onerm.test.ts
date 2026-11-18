import { describe, expect, it } from 'vitest';
import type { State } from './api';
import { buildPayload, type Draft } from './draft';
import { buildSummary, summaryFromDetail } from './summary';
import { checkTestRecord } from './training';

const state: State = {
  apiVersion: '1.7.0',
  days: [],
  exercises: [
    { id: 'E06', name: 'Bankdrücken', muscleGroup: 'Brust', type: 'Grundübung', repsMin: 6, repsMax: 10,
      increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: 20 },
  ],
  history: {
    E06: { lastSession: { date: '2026-11-09', sets: [{ set: 1, kg: 80, reps: 8, failure: false }] }, bestE1rm: 101.3,
      bestRepsAtZero: 0, bestTest: { kg: 100, date: '2026-10-01' } },
  },
};

const draft = (kg: string, reps: string[], test: boolean): Draft => ({
  clientId: 'c', day: 'Push', date: '2026-11-10', deload: false, note: '', touched: true,
  items: [{ id: 'E06', name: 'Bankdrücken', kg, reps, failure: true, test }],
});

describe('1RM test', () => {
  it('builds one set with 1 rep, no failure mark, whatever the set fields hold', () => {
    const result = buildPayload(draft('105', ['', '', '', ''], true));
    expect('payload' in result && result.payload.exercises[0]).toEqual(
      { id: 'E06', sets: [{ kg: 105, reps: 1 }], failure: false, test: true });
  });
  it('needs a weight', () => {
    const result = buildPayload(draft('', ['', '', '', ''], true));
    expect('error' in result && result.field).toBe('kg');
  });
  it('a normal exercise sends no test flag', () => {
    const result = buildPayload(draft('80', ['8', '8', '', ''], false));
    expect('payload' in result && result.payload.exercises[0].test).toBeUndefined();
  });
  it('is a record above the best test, also the first test', () => {
    expect(checkTestRecord(state.history.E06, 102.5)).toMatchObject({ isRecord: true, kind: 'test', text: 'Neues 1RM: 102,5 kg (+2,5 kg)' });
    expect(checkTestRecord(state.history.E06, 100).isRecord).toBe(false);
    expect(checkTestRecord({ ...state.history.E06, bestTest: null }, 90)).toMatchObject({ isRecord: true, text: 'Neues 1RM: 90 kg (erster Test)' });
  });
  it('summary: no volume, e1RM = lifted weight, counts as PR when it beats the best test', () => {
    const payload = buildPayload(draft('102,5', [], true));
    if (!('payload' in payload)) throw new Error('no payload');
    const summary = buildSummary(payload.payload, state);
    expect(summary.volume).toBe(0);
    expect(summary.prCount).toBe(1);
    expect(summary.exercises[0].sets).toEqual([{ set: 1, kg: 102.5, reps: 1, e1rm: 102.5, isPr: true, test: true }]);
  });
  it('history summary keeps test sets out of the volume', () => {
    const summary = summaryFromDetail({ date: '2026-11-10', day: 'Push', deload: false, note: '', exercises: [{
      id: 'E06', name: 'Bankdrücken', sets: [{ set: 1, kg: 105, reps: 1, failure: false, e1rm: 105, isPr: true, test: true }] }] });
    expect(summary.volume).toBe(0);
    expect(summary.prCount).toBe(1);
  });
});
