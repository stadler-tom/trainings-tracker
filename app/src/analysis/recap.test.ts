import { describe, expect, it } from 'vitest';
import type { BodyEntry, Exercise } from '../api';
import { addDays } from '../format';
import { exerciseStats, type AnalysisData, type ExerciseStats, type LogRow } from './analysis';
import {
  limitedTracking, plannedSets, plannedStats, recomposition, reentryDate, stallOf, strengthIndex, summary, weekSets, weightSlope,
} from './recap';

const TODAY = '2026-11-23';        // a Monday
const ex = (id: string, name: string, muscleGroup: string, type = 'Grundübung'): Exercise =>
  ({ id, name, muscleGroup, type, repsMin: 6, repsMax: 10, increment: 2.5, weightType: 'Gesamt', active: true, note: '', barWeight: null });
const EXERCISES = [ex('E1', 'Bank', 'Brust'), ex('E2', 'Rudern', 'Rücken'), ex('E3', 'Kniebeuge', 'Beine'), ex('E4', 'Curls', 'Bizeps'),
  ex('W1', 'Außenrotation', 'Schulter', 'Aufwärmen')];

type Opts = { deload?: boolean; limited?: string | null; drop?: number; test?: boolean };
const sets = (date: string, id: string, kg: number, reps: number[], o: Opts = {}): LogRow[] =>
  reps.map((r, i) => [date, 'Tag', id, i + 1, kg, r, false, o.deload ?? false, o.test ?? false, o.limited ?? null, o.drop ?? null]);

function data(log: LogRow[], body: BodyEntry[] = [], target = -0.5): AnalysisData {
  return {
    apiVersion: '1.10.0',
    days: [
      { name: 'Push', exerciseIds: ['W1', 'E1', 'E4'], slots: [{ id: 'W1', sets: 2 }, { id: 'E1', sets: 4 }, { id: 'E4', sets: 3 }] },
      { name: 'Pull', exerciseIds: ['E2', 'E1'], slots: [{ id: 'E2', sets: 3 }, { id: 'E1', sets: 3 }] },
      { name: 'Beine', exerciseIds: ['E3'], slots: [{ id: 'E3', sets: 3 }] },
    ],
    exercises: EXERCISES,
    muscleGroups: [{ name: 'Brust', setsMin: null, setsMax: null }, { name: 'Rücken', setsMin: null, setsMax: null },
      { name: 'Beine', setsMin: null, setsMax: null }, { name: 'Bizeps', setsMin: null, setsMax: null }],
    log, body, settings: { deloadWeeks: 8, weightTarget: target },
  };
}
function statsOf(d: AnalysisData): Map<string, ExerciseStats> {
  return new Map(d.exercises.map((e) => [e.id, exerciseStats(e, d.log, d.body)]));
}
/** Daily weighings from `from` for `count` days, falling `perWeek` kg per week. */
const weighings = (from: string, count: number, start: number, perWeek: number): BodyEntry[] =>
  Array.from({ length: count }, (_, i) => ({ date: addDays(from, i), weight: start + (perWeek / 7) * i, waist: null }));

/** One session per week for 6 weeks before TODAY; e1RM grows by `step` kg weight per week. */
const sixWeeks = (id: string, kg: number, step: number): LogRow[] =>
  Array.from({ length: 6 }, (_, i) => sets(addDays(TODAY, -40 + 7 * i), id, kg + step * i, [8, 8, 8])).flat();

describe('weightSlope', () => {
  it('is the trend in kg per week over the last 28 days', () => {
    expect(weightSlope(data([], weighings(addDays(TODAY, -27), 28, 98, -0.5)), TODAY)).toBeCloseTo(-0.5, 5);
  });
  it('needs 4 weighings over at least 10 days', () => {
    expect(weightSlope(data([], weighings(addDays(TODAY, -3), 4, 98, -0.5)), TODAY)).toBeNull();
    expect(weightSlope(data([], weighings(addDays(TODAY, -20), 3, 98, -0.5)), TODAY)).toBeNull();
  });
});

describe('strengthIndex', () => {
  it('is the median of the per-exercise changes, so one outlier does not tip it', () => {
    const d = data([...sixWeeks('E1', 80, 1), ...sixWeeks('E2', 60, 0), ...sixWeeks('E3', 100, -1), ...sixWeeks('E4', 20, 5)]);
    const index = strengthIndex(plannedStats(d, statsOf(d)), TODAY)!;
    expect(index.count).toBe(4);
    expect(index.median).toBeGreaterThan(0);
    expect(index.median).toBeLessThan(5);           // the +5 kg/week curls do not dominate
  });
  it('ignores deload, limited sessions and warm-up exercises; null below 3 exercises', () => {
    const d = data([...sixWeeks('E1', 80, 1), ...sixWeeks('W1', 5, 1), ...sets(addDays(TODAY, -2), 'E2', 200, [8], { limited: 'Schulter' }),
      ...sets(addDays(TODAY, -3), 'E3', 200, [8], { deload: true })]);
    expect(strengthIndex(plannedStats(d, statsOf(d)), TODAY)).toBeNull();
  });
});

describe('reentryDate', () => {
  it('finds the first training after a break of 4+ weeks within the last 6 weeks', () => {
    const d = data([...sets('2026-06-01', 'E1', 80, [8]), ...sets('2026-11-02', 'E1', 70, [8]), ...sets('2026-11-09', 'E1', 72.5, [8])]);
    expect(reentryDate(d, TODAY)).toBe('2026-11-02');
    expect(reentryDate(d, '2026-12-20')).toBeNull();
  });
});

describe('recomposition', () => {
  const body = weighings(addDays(TODAY, -27), 28, 98, -0.5);
  const rising = [...sixWeeks('E1', 80, 2.5), ...sixWeeks('E2', 60, 2.5), ...sixWeeks('E3', 100, 2.5)];
  const falling = [...sixWeeks('E1', 80, -2.5), ...sixWeeks('E2', 60, -2.5), ...sixWeeks('E3', 100, -2.5)];
  const light = (log: LogRow[], b: BodyEntry[], target = -0.5) => { const d = data(log, b, target); return recomposition(d, statsOf(d), TODAY); };
  it('green: weight on plan and strength rising', () => {
    const r = light(rising, body);
    expect(r.light).toBe('green');
    expect(r.verdict).toContain('Rekomposition läuft');
  });
  it('red: strength falling in the deficit', () => {
    expect(light(falling, body).light).toBe('red');
    expect(light(falling, body).advice).toContain('Kohlenhydrate');
  });
  it('yellow: strength fine but weight stalls', () => {
    const r = light(rising, weighings(addDays(TODAY, -27), 28, 98, 0));
    expect(r.light).toBe('yellow');
    expect(r.advice).toContain('Bauchumfang');
  });
  it('yellow: weight drops faster than planned', () => {
    expect(light(rising, weighings(addDays(TODAY, -27), 28, 98, -1.2)).verdict).toContain('schneller');
  });
  it('none without enough data', () => {
    expect(light(rising, []).light).toBe('none');
  });
});

describe('stallOf', () => {
  const run = (log: LogRow[]) => { const d = data(log); return stallOf(statsOf(d).get('E1')!); };
  it('3 sessions without beating the last progress session = stalled, small ups and downs included', () => {
    const s = run([...sets('2026-10-01', 'E1', 80, [10]), ...sets('2026-10-08', 'E1', 80, [8]),
      ...sets('2026-10-15', 'E1', 80, [9]), ...sets('2026-10-22', 'E1', 80, [8])]);
    expect(s).toMatchObject({ sessions: 3, since: '2026-10-01' });
  });
  it('a weight increase counts as progress even with fewer reps', () => {
    expect(run([...sets('2026-10-01', 'E1', 80, [10]), ...sets('2026-10-08', 'E1', 82.5, [6]),
      ...sets('2026-10-15', 'E1', 82.5, [6]), ...sets('2026-10-22', 'E1', 82.5, [7])])).toBeNull();
  });
  it('deload and limited sessions do not count', () => {
    expect(run([...sets('2026-10-01', 'E1', 80, [10]), ...sets('2026-10-08', 'E1', 60, [8], { deload: true }),
      ...sets('2026-10-15', 'E1', 70, [5], { limited: '' }), ...sets('2026-10-22', 'E1', 80, [9]), ...sets('2026-10-29', 'E1', 80, [11])])).toBeNull();
  });
});

describe('weekSets', () => {
  it('plan per muscle group from the day sheets, without warm-ups', () => {
    expect(Object.fromEntries(plannedSets(data([])))).toEqual({ Brust: 7, Bizeps: 3, Rücken: 3, Beine: 3 });
  });
  it('lists the groups below plan in the last complete week; drops and tests do not count', () => {
    const lastWeek = '2026-11-16';
    const d = data([...sets(lastWeek, 'E1', 80, [8, 8, 8, 8, 8, 8]), ...sets(lastWeek, 'E1', 60, [10], { drop: 1 }),
      ...sets('2026-11-18', 'E2', 60, [8, 8, 8]), ...sets('2026-11-19', 'E3', 100, [5, 5]), ...sets('2026-11-19', 'E3', 140, [1], { test: true }),
      ...sets(TODAY, 'E4', 20, [10, 10, 10])]);
    const w = weekSets(d, TODAY);
    expect(w.week).toBe(lastWeek);
    expect(w.short).toEqual([{ group: 'Brust', planned: 7, done: 6 }, { group: 'Beine', planned: 3, done: 2 }, { group: 'Bizeps', planned: 3, done: 0 }]);
  });
  it('halves the plan in a deload week', () => {
    const d = data([...sets('2026-11-17', 'E1', 60, [8, 8, 8, 8], { deload: true }), ...sets('2026-11-18', 'E2', 50, [8, 8])]);
    const w = weekSets(d, TODAY);
    expect(w.deload).toBe(true);
    expect(w.short.find((s) => s.group === 'Brust')).toBeUndefined();     // 4 of ceil(7/2) = 4
    expect(w.short.find((s) => s.group === 'Rücken')).toBeUndefined();    // 2 of ceil(3/2) = 2
  });
});

describe('limitedTracking', () => {
  it('counts limited sessions per week and exercise and compares the last 3 weeks with the 3 before', () => {
    const d = data([...sets('2026-10-14', 'E1', 70, [8], { limited: 'Schulter links' }), ...sets('2026-10-21', 'E1', 70, [8], { limited: '' }),
      ...sets('2026-10-21', 'E4', 15, [10], { limited: 'Ellbogen' }), ...sets('2026-11-18', 'E1', 75, [8], { limited: 'leicht' }),
      ...sets('2026-11-18', 'E2', 60, [8])]);
    const l = limitedTracking(statsOf(d), TODAY);
    expect(l.weeks.map((w) => w.count)).toEqual([2, 0, 0, 0, 1, 0]);          // 14.10. is before the 6 weeks
    expect(l.trend).toBe('better');
    expect(l.exercises[0]).toEqual({ name: 'Bank', count: 2, lastDate: '2026-11-18', reason: 'leicht' });
  });
  it('none without limited sessions', () => {
    expect(limitedTracking(statsOf(data(sets('2026-11-18', 'E1', 80, [8]))), TODAY).trend).toBe('none');
  });
});

describe('summary', () => {
  const body = weighings(addDays(TODAY, -27), 28, 98, -0.5);
  it('sums up all tiles and puts missed trainings first when the light is not red', () => {
    const log = [...sixWeeks('E1', 80, 2.5), ...sixWeeks('E2', 60, 2.5), ...sixWeeks('E3', 100, 2.5)];
    const d = data(log, body);
    const s = summary(d, statsOf(d), TODAY);
    expect(s.lines[0]).toBe('Letzte Woche: 1 von 3 Trainingstagen.');
    expect(s.lines.some((l) => l.startsWith('Kraft: +'))).toBe(true);
    expect(s.lines.some((l) => l.startsWith('Wochensoll verfehlt bei Brust'))).toBe(true);
    expect(s.focus).toContain('Trainingstage durchziehen');
  });
  it('a red light is the focus', () => {
    const log = [...sixWeeks('E1', 80, -2.5), ...sixWeeks('E2', 60, -2.5), ...sixWeeks('E3', 100, -2.5)];
    const d = data(log, body);
    expect(summary(d, statsOf(d), TODAY).focus).toContain('Kraft sinkt im Defizit');
  });
  it('all good: keep going', () => {
    const lastWeek = '2026-11-16';
    const log = [...sixWeeks('E1', 80, 2.5), ...sixWeeks('E2', 60, 2.5), ...sixWeeks('E3', 100, 2.5),
      ...sets(lastWeek, 'E1', 90, [8, 8, 8, 8, 8, 8, 8]).map((r) => { r[1] = 'Push'; return r; }),
      ...sets('2026-11-18', 'E2', 70, [8, 8, 8]).map((r) => { r[1] = 'Pull'; return r; }),
      ...sets('2026-11-19', 'E3', 115, [8, 8, 8]).map((r) => { r[1] = 'Beine'; return r; }),
      ...sets(lastWeek, 'E4', 20, [10, 10, 10]).map((r) => { r[1] = 'Push'; return r; })];
    const d = data(log, body);
    const s = summary(d, statsOf(d), TODAY);
    expect(s.lines).toContain('Alle Muskelgruppen haben ihr Wochensoll erreicht.');
    expect(s.focus).toContain('Weiter so');
  });
});
