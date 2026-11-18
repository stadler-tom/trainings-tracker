import { describe, expect, it } from 'vitest';
import type { Exercise } from '../api';
import { exerciseStats, nextTraining, weeklySets, type AnalysisData, type LogRow } from './analysis';

const bench: Exercise = { id: 'E06', name: 'Bankdrücken', muscleGroup: 'Brust', type: 'Grundübung', repsMin: 6, repsMax: 10,
  increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: 20 };
const pullUp: Exercise = { ...bench, id: 'E13', name: 'Klimmzüge', muscleGroup: 'Rücken', weightType: 'Zusatzgewicht' };
const warmUp: Exercise = { ...bench, id: 'E26', name: 'Außenrotation', muscleGroup: 'Rotatorenmanschette', type: 'Aufwärmen' };

/** One session: sets with the same weight. */
const session = (date: string, id: string, kg: number, reps: number[], opts: { deload?: boolean; test?: boolean; day?: string } = {}): LogRow[] =>
  reps.map((r, i) => [date, opts.day ?? 'Push', id, i + 1, kg, r, false, opts.deload ?? false, opts.test ?? false]);

describe('exerciseStats', () => {
  const log = [
    ...session('2026-10-01', 'E06', 80, [8, 8, 7]),
    ...session('2026-10-08', 'E06', 80, [9, 8, 8]),     // record
    ...session('2026-10-10', 'E06', 100, [1], { test: true }),
    ...session('2026-10-15', 'E06', 60, [8, 8], { deload: true }),
    ...session('2026-10-22', 'E06', 80, [9, 9, 8]),
  ];
  const s = exerciseStats(bench, log, []);
  it('keeps 1RM tests out of the sessions and records', () => {
    expect(s.tests).toEqual([{ date: '2026-10-10', kg: 100 }]);
    expect(s.sessions.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22']);
    expect(s.best?.date).toBe('2026-10-08');
    expect(s.history.bestTest).toEqual({ date: '2026-10-10', kg: 100 });
  });
  it('marks records against earlier regular sessions only, never the first or a deload', () => {
    expect(s.sessions.map((x) => x.isRecord)).toEqual([false, true, false, false]);
  });
  it('the last regular session drives the next training (deload ignored)', () => {
    expect(s.history.lastSession?.date).toBe('2026-10-22');
    expect(nextTraining(s)).toEqual({ kg: '80 kg', hint: 'Steigt auf 82,5 kg, wenn Satz 1 10 Wdh schafft und alle Sätze mind. 6.' });
  });
  it('volume is kg × reps, like the app', () => {
    expect(s.sessions[0].volume).toBe(80 * 23);
  });
});

describe('status', () => {
  it('jump when rule 2 is met', () => {
    const s = exerciseStats(bench, [...session('2026-10-01', 'E06', 80, [8, 8]), ...session('2026-10-08', 'E06', 80, [10, 9, 8])], []);
    expect(s.status).toBe('jump');
    expect(nextTraining(s).kg).toBe('82,5 kg (neu)');
  });
  it('stalled after 3 regular sessions without a new best', () => {
    const log = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].flatMap((d, i) =>
      session(d, 'E06', 80, i === 0 ? [9, 9] : [8, 8]));
    expect(exerciseStats(bench, log, []).status).toBe('stalled');
  });
  it('rising with a recent record, new with one session', () => {
    expect(exerciseStats(bench, [...session('2026-10-01', 'E06', 80, [7]), ...session('2026-10-08', 'E06', 80, [8])], []).status).toBe('rising');
    expect(exerciseStats(bench, session('2026-10-01', 'E06', 80, [7]), []).status).toBe('new');
  });
});

describe('added weight', () => {
  it('counts the body weight of that day in the e1RM', () => {
    const body = [{ date: '2026-09-30', weight: 90, waist: null }, { date: '2026-10-07', weight: 88, waist: null }];
    const s = exerciseStats(pullUp, [...session('2026-10-01', 'E13', 10, [6]), ...session('2026-10-08', 'E13', 10, [6])], body);
    expect(s.sessions.map((x) => Math.round(x.e1rm * 10) / 10)).toEqual([120, 117.6]);
  });
});

describe('weeklySets', () => {
  const data: AnalysisData = {
    apiVersion: '1.7.0', days: [], body: [], settings: { deloadWeeks: 8, weightTarget: -0.5 },
    exercises: [bench, pullUp, warmUp],
    muscleGroups: [{ name: 'Brust', setsMin: 10, setsMax: 16 }, { name: 'Bauch', setsMin: null, setsMax: null }],
    log: [
      ...session('2026-11-02', 'E06', 80, [8, 8, 8]),
      ...session('2026-11-03', 'E06', 100, [1], { test: true }),
      ...session('2026-11-03', 'E26', 5, [15, 15]),
      ...session('2026-11-05', 'E13', 0, [8, 8], { deload: true }),
      ...session('2026-11-10', 'E06', 80, [8]),
    ],
  };
  const result = weeklySets(data, ['2026-11-02', '2026-11-09']);
  it('counts working sets per current group and week, without tests and warm-ups', () => {
    expect(result.get('Brust')!.map((w) => w.sets)).toEqual([3, 1]);
    expect(result.get('Rücken')!.map((w) => w.sets)).toEqual([2, 0]);
    expect(result.has('Rotatorenmanschette')).toBe(false);
  });
  it('lists every group of the sheet, also without sets, and marks deload weeks', () => {
    expect(result.get('Bauch')!.map((w) => w.sets)).toEqual([0, 0]);
    expect(result.get('Brust')!.map((w) => w.deload)).toEqual([true, false]);
  });
});

describe('rangeStart', () => {
  it('counts back from today, "Gesamt" starts at the first data', async () => {
    const { rangeStart } = await import('./analysis');
    expect(rangeStart('1w', '2026-11-18', '2025-01-01')).toBe('2026-11-12');
    expect(rangeStart('1m', '2026-11-18', '2025-01-01')).toBe('2026-10-20');
    expect(rangeStart('all', '2026-11-18', '2025-01-01')).toBe('2025-01-01');
    expect(rangeStart('all', '2026-11-18', undefined)).toBe('2026-11-18');
  });
});
