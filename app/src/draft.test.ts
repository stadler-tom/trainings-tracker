import { describe, expect, it } from 'vitest';
import type { State } from './api';
import { buildPayload, newDraft, newItem, parseKg, todayIso, type Draft } from './draft';

const state: State = {
  apiVersion: '1.1.0',
  days: [{ name: 'Push', lastDate: '2026-11-04', exerciseIds: ['E06', 'E08', 'E99'] }],
  exercises: [
    { id: 'E06', name: 'Schrägbankdrücken Multipresse', muscleGroup: 'Brust', type: 'Grundübung', repsMin: 6, repsMax: 10,
      increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: 0 },
    { id: 'E08', name: 'Kabel-Fliegende stehend (mittig)', muscleGroup: 'Brust', type: 'Isolation', repsMin: 10, repsMax: 15,
      increment: 1.25, weightType: 'pro Seite', active: true, note: '', barWeight: null },
  ],
  history: {
    E06: { lastSession: { date: '2026-11-04', sets: [1, 2, 3].map((set) => ({ set, kg: 40, reps: 8, failure: false })) },
      bestE1rm: 50.67, bestRepsAtZero: 0 },
  },
};

function draftWith(items: Partial<Draft['items'][number]>[]): Draft {
  const draft = newDraft(state, 'Push', '2026-11-12');
  draft.items = items.map((i, n) => ({ ...draft.items[n], ...i }));
  return draft;
}

describe('newDraft', () => {
  it('prefills the target weight, leaves reps empty and keeps the slot order', () => {
    const draft = newDraft(state, 'Push', '2026-11-12');
    expect(draft.items.map((i) => i.id)).toEqual(['E06', 'E08', 'E99']);
    expect(draft.items[0].kg).toBe('40');
    expect(draft.items[0].reps).toEqual(['', '', '', '']);
    expect(draft.items[1].kg).toBe('');               // no history: find the weight
    expect(draft.items[2].name).toBe('E99');          // unknown id stays visible
    expect(draft.touched).toBe(false);
    expect(draft.clientId).not.toBe(newDraft(state, 'Push').clientId);
  });
});

describe('newItem', () => {
  it('added weight without history starts at 0 kg, other types stay empty', () => {
    const withPullUp: State = { ...state, exercises: [...state.exercises,
      { id: 'E30', name: 'Klimmzüge', muscleGroup: 'Rücken', type: 'Grundübung', repsMin: 6, repsMax: 10,
        increment: 2.5, weightType: 'Zusatzgewicht', active: true, note: '', barWeight: null }] };
    expect(newItem(withPullUp, 'E30', false).kg).toBe('0');
    expect(newItem(withPullUp, 'E08', false).kg).toBe('');
  });
});

describe('parseKg', () => {
  it('accepts decimal comma and point', () => {
    expect(parseKg('72,5')).toBe(72.5);
    expect(parseKg('0')).toBe(0);
    expect(parseKg(' ')).toBeNull();
    expect(parseKg('abc')).toBeNull();
    expect(parseKg('-5')).toBeNull();
  });
});

describe('buildPayload', () => {
  it('builds the payload and skips exercises without sets', () => {
    const result = buildPayload(draftWith([{ reps: ['8', '8', '', '7'], failure: true }, {}, {}]));
    expect('payload' in result && result.payload.exercises).toEqual([
      { id: 'E06', kg: 40, reps: [8, 8, null, 7], failure: true },
    ]);
    expect('sets' in result && result.sets).toBe(3);
  });
  it('rejects reps without weight', () => {
    expect(buildPayload(draftWith([{ kg: '', reps: ['8', '', '', ''] }, {}, {}]))).toEqual({
      error: 'Bei „Schrägbankdrücken Multipresse“ fehlt das Gewicht.', itemIndex: 0, field: 'kg',
    });
  });
  it('rejects invalid reps', () => {
    expect(buildPayload(draftWith([{ reps: ['8', '7,5', '', ''] }, {}, {}]))).toEqual({
      error: 'Bei „Schrägbankdrücken Multipresse“ ist Satz 2 keine gültige Wiederholungszahl.', itemIndex: 0, field: 1,
    });
  });
  it('needs at least one set', () => {
    expect(buildPayload(draftWith([{}, {}, {}]))).toEqual({ error: 'Es ist noch kein Satz eingetragen.' });
  });
});

describe('todayIso', () => {
  it('uses the local date', () => {
    expect(todayIso(new Date(2026, 10, 2, 23, 30))).toBe('2026-11-02');
  });
});

describe('draftFromTraining', () => {
  it('fills the items from a saved training and marks it as correction', async () => {
    const { draftFromTraining } = await import('./draft');
    const draft = draftFromTraining({
      date: '2026-11-08', day: 'Push', deload: false, note: 'Schulter ok',
      exercises: [{ id: 'E06', name: 'Multipresse', sets: [
        { set: 1, kg: 42.5, reps: 8, failure: false, e1rm: 53.8, isPr: true },
        { set: 3, kg: 42.5, reps: 6, failure: true, e1rm: 51, isPr: false },
      ] }],
    });
    expect(draft.items).toEqual([{ id: 'E06', name: 'Multipresse', kg: '42,5', reps: ['8', '', '6', ''], failure: true }]);
    expect(draft.replaces).toEqual({ date: '2026-11-08', day: 'Push' });
    expect(draft.touched).toBe(true);
    const result = buildPayload(draft);
    expect('payload' in result && result.payload.replaces).toEqual({ date: '2026-11-08', day: 'Push' });
  });
});
