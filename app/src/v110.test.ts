// Version 1.10: supersets in the day plan, drop sets after the last set.
import { describe, expect, it } from 'vitest';
import type { Exercise, State, TrainingDetail } from './api';
import { buildPayload, dropKg, newDraft, type Draft } from './draft';
import { buildSummary, summaryFromDetail } from './summary';

const curl: Exercise = { id: 'E16', name: 'Bayesian Curls', muscleGroup: 'Bizeps', type: 'Isolation', repsMin: 10, repsMax: 20,
  increment: 1.25, weightType: 'pro Seite', active: true, note: '', barWeight: null };
const press: Exercise = { id: 'E11', name: 'Trizepsdrücken', muscleGroup: 'Trizeps', type: 'Isolation', repsMin: 10, repsMax: 15,
  increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: null };
const state: State = {
  apiVersion: '1.10.0', exercises: [curl, press], history: {},
  days: [{ name: 'Pull', lastDate: null, exerciseIds: ['E16', 'E11'],
    slots: [{ id: 'E16', sets: 3, superset: true }, { id: 'E11', sets: 3, superset: false }] }],
};

function draftWith(reps: string[], kg: string, drops: { kg: string; reps: string }[]): Draft {
  const draft = newDraft(state, 'Pull', '2026-11-20');
  draft.items[1].kg = kg;
  draft.items[1].reps = reps;
  draft.items[1].drops = drops;
  return draft;
}

describe('supersets', () => {
  it('the link comes from the day sheet', () => {
    const draft = newDraft(state, 'Pull', '2026-11-20');
    expect(draft.items.map((i) => i.superset)).toEqual([true, false]);
  });
});

describe('dropKg', () => {
  const item = (kg: string, reps: string[], drops: { kg: string; reps: string }[] = []) =>
    ({ id: 'E11', name: 'x', kg, kgs: reps.map(() => kg), reps, failure: false, drops });
  it('20 % below the last set, rounded down to the weight step', () => {
    expect(dropKg(item('50', ['12', '11', '10']), false, 2.5)).toBe('40');
    expect(dropKg(item('42,5', ['12', '11', '10']), false, 2.5)).toBe('32,5');   // 34 -> 32,5
  });
  it('a second drop starts below the first one', () => {
    expect(dropKg(item('50', ['12'], [{ kg: '40', reps: '8' }]), false, 2.5)).toBe('30');
  });
  it('per set: the weight of the last set done', () => {
    const perSet = { ...item('', ['12', '10', '']), kgs: ['50', '45', '45'] };
    expect(dropKg(perSet, true, 1.25)).toBe('35');   // 45 kg -> 36 -> 35 (steps of 1,25)
  });
  it('without a weight step in steps of 0,5 kg; nothing sensible left gives empty', () => {
    expect(dropKg(item('7', ['10']), false, 0)).toBe('5,5');
    expect(dropKg(item('0', ['10']), false, 2.5)).toBe('');
  });
});

describe('buildPayload with drops', () => {
  it('drops after the sets, prepared but empty drops are left out', () => {
    const result = buildPayload(draftWith(['12', '11', '10'], '50', [{ kg: '40', reps: '8' }, { kg: '30', reps: '' }]));
    expect('payload' in result && result.payload.exercises).toEqual([
      { id: 'E11', sets: [{ kg: 50, reps: 12 }, { kg: 50, reps: 11 }, { kg: 50, reps: 10 }], failure: false, limited: null,
        drops: [{ kg: 40, reps: 8 }] },
    ]);
  });
  it('no drops key without drops (older scripts get the same payload as before)', () => {
    const result = buildPayload(draftWith(['12'], '50', []));
    expect('payload' in result && 'drops' in result.payload.exercises[0]).toBe(false);
  });
  it('a drop without weight is marked', () => {
    const result = buildPayload(draftWith(['12'], '50', [{ kg: '', reps: '8' }]));
    expect(result).toMatchObject({ itemIndex: 1, field: 'drop-kg-0' });
  });
  it('invalid drop reps are marked', () => {
    const result = buildPayload(draftWith(['12'], '50', [{ kg: '40', reps: '8' }, { kg: '30', reps: '0' }]));
    expect(result).toMatchObject({ itemIndex: 1, field: 'drop-1' });
  });
  it('a drop without a normal set is an error', () => {
    const result = buildPayload(draftWith(['', '', ''], '50', [{ kg: '40', reps: '8' }]));
    expect('error' in result && result.error).toContain('keinen normalen Satz');
  });
});

describe('summary with drops', () => {
  it('drops count for the volume and are listed, never a record', () => {
    const result = buildPayload(draftWith(['12', '11'], '50', [{ kg: '40', reps: '8' }]));
    if (!('payload' in result)) throw new Error('no payload');
    const summary = buildSummary(result.payload, state);
    expect(summary.volume).toBe(50 * 23 + 40 * 8);
    expect(summary.exercises[0].drops).toEqual([{ kg: 40, reps: 8 }]);
  });
  it('history summary takes the drops from the web API', () => {
    const detail: TrainingDetail = { date: '2026-11-20', day: 'Pull', deload: false, note: '', exercises: [{ id: 'E11', name: 'Trizepsdrücken',
      sets: [{ set: 1, kg: 50, reps: 12, failure: false, e1rm: 70, isPr: false }], drops: [{ drop: 1, kg: 40, reps: 8 }] }] };
    const summary = summaryFromDetail(detail);
    expect(summary.volume).toBe(600 + 320);
    expect(summary.exercises[0].drops).toEqual([{ kg: 40, reps: 8 }]);
  });
});
