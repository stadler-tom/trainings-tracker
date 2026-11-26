import { describe, expect, it } from 'vitest';
import type { BodyEntry, Exercise } from '../api';
import { exerciseStats, type ExerciseStats, type LogRow } from './analysis';
import { dropOff, fatigue, progressRates, relativeChanges, relativeStrength, repRecords, suspicious } from './insights';

const TODAY = '2026-11-23';
const ex = (id: string, name: string, type = 'Grundübung', weightType = 'Gesamt'): Exercise =>
  ({ id, name, muscleGroup: 'Brust', type, repsMin: 6, repsMax: 10, increment: 2.5, weightType, active: true, note: '', barWeight: null });

type Opts = { deload?: boolean; limited?: string | null; drop?: number; test?: boolean };
/** Sets of one session; kg can be one weight for all sets or one per set. */
const sets = (date: string, id: string, kg: number | number[], reps: number[], o: Opts = {}): LogRow[] =>
  reps.map((r, i) => [date, 'Tag', id, i + 1, Array.isArray(kg) ? kg[i] : kg, r, false, o.deload ?? false, o.test ?? false, o.limited ?? null, o.drop ?? null]);
const stats = (e: Exercise, log: LogRow[], body: BodyEntry[] = []): ExerciseStats => exerciseStats(e, log, body);
const weigh = (date: string, weight: number): BodyEntry => ({ date, weight, waist: null });

describe('repRecords', () => {
  it('heaviest weight per rep count; beaten when more reps were done with at least that weight', () => {
    const s = stats(ex('E1', 'Bank'), [...sets('2026-10-01', 'E1', 80, [8, 6]), ...sets('2026-10-08', 'E1', 82.5, [8, 7]),
      ...sets('2026-10-15', 'E1', 70, [10]), ...sets('2026-10-22', 'E1', 100, [12], { limited: 'Technik' }),
      ...sets('2026-10-22', 'E1', 60, [15], { drop: 1 }), ...sets('2026-10-29', 'E1', 120, [1], { test: true })]);
    expect(repRecords(s)).toEqual([
      { reps: 6, kg: 80, date: '2026-10-01', beaten: true },       // 82,5 kg × 7 and × 8
      { reps: 7, kg: 82.5, date: '2026-10-08', beaten: true },
      { reps: 8, kg: 82.5, date: '2026-10-08', beaten: false },
      { reps: 10, kg: 70, date: '2026-10-15', beaten: false },
    ]);                                                              // no limited, drop or test sets
  });
});

describe('relativeStrength', () => {
  it('e1RM per kg body weight with a weighing at most 14 days away', () => {
    const s = stats(ex('E1', 'Bank'), [...sets('2026-10-01', 'E1', 90, [0 + 1]), ...sets('2026-11-01', 'E1', 90, [1])]);
    const body = [weigh('2026-09-28', 100), weigh('2026-11-20', 90)];
    expect(relativeStrength(s, body)).toEqual([{ date: '2026-10-01', ratio: (90 * (1 + 1 / 30)) / 100, bodyWeight: 100 }]);   // 01.11.: no weighing near
  });
  it('change of the planned basic exercises over 6 weeks, isolation exercises left out', () => {
    const bank = stats(ex('E1', 'Bank'), [...sets('2026-10-20', 'E1', 90, [1]), ...sets('2026-11-20', 'E1', 90, [1])]);
    const fly = stats(ex('E2', 'Fly', 'Isolation'), [...sets('2026-10-20', 'E2', 20, [1]), ...sets('2026-11-20', 'E2', 25, [1])]);
    const body = [weigh('2026-10-19', 100), weigh('2026-11-19', 90)];
    const changes = relativeChanges([bank, fly], body, TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].change).toBeCloseTo(11.11, 2);                  // same strength, 10 kg lighter
  });
});

describe('dropOff and fatigue', () => {
  it('drop from best to weakest set; added weight includes the body weight', () => {
    const s = stats(ex('E1', 'Lu Raises', 'Isolation'), sets('2026-11-18', 'E1', 10, [15, 11, 13]));
    expect(dropOff(s.sessions[0], s, [])).toBeCloseTo((4 / 15) * 100, 6);                     // 15 → 11 = −27 %
    const mixed = stats(ex('E4', 'M'), sets('2026-11-18', 'E4', [50, 40], [10, 10]));
    expect(dropOff(mixed.sessions[0], mixed, [])).toBeCloseTo(((10 - (30 * ((40 * (1 + 10 / 30)) / 50 - 1))) / 10) * 100, 6);   // 40 × 10 ≈ 50 × 2,7
    const dips = ex('E2', 'Dips', 'Grundübung', 'Zusatzgewicht');
    const d = stats(dips, sets('2026-11-18', 'E2', 0, [10, 8]), [weigh('2026-11-01', 90)]);
    expect(dropOff(d.sessions[0], d, [weigh('2026-11-01', 90)])).toBeGreaterThan(0);
    expect(dropOff(stats(ex('E3', 'X'), sets('2026-11-18', 'E3', 10, [12])).sessions[0], s, [])).toBeNull();
  });
  it('median over the exercises of the last 3 weeks, against the 3 weeks before; high drops listed', () => {
    const a = stats(ex('E1', 'A'), [...sets('2026-10-20', 'E1', 50, [10, 9, 9]), ...sets('2026-11-18', 'E1', 50, [12, 8, 7])]);
    const b = stats(ex('E2', 'B'), [...sets('2026-10-21', 'E2', 50, [10, 10]), ...sets('2026-11-19', 'E2', 50, [10, 9])]);
    const f = fatigue([a, b], [], TODAY);
    expect(f.high.map((h) => h.stats.exercise.name)).toEqual(['A']);
    expect(f.median!).toBeGreaterThan(f.medianEarlier!);
  });
});

describe('progressRates', () => {
  it('trend in percent per week over 6 weeks, fastest first, at least 3 sessions', () => {
    const up = stats(ex('E1', 'Up'), [...sets('2026-11-02', 'E1', 100, [1]), ...sets('2026-11-09', 'E1', 102, [1]), ...sets('2026-11-16', 'E1', 104, [1])]);
    const flat = stats(ex('E2', 'Flat'), [...sets('2026-11-02', 'E2', 50, [1]), ...sets('2026-11-09', 'E2', 50, [1]), ...sets('2026-11-16', 'E2', 50, [1])]);
    const few = stats(ex('E3', 'Few'), [...sets('2026-11-02', 'E3', 50, [1]), ...sets('2026-11-16', 'E3', 60, [1])]);
    const rates = progressRates([flat, up, few], TODAY);
    expect(rates.map((r) => r.stats.exercise.name)).toEqual(['Up', 'Flat']);
    expect(rates[0].perWeek).toBeCloseTo(((2 * (1 + 1 / 30)) / (102 * (1 + 1 / 30))) * 100, 6);
    expect(rates[1].perWeek).toBe(0);
  });
});

describe('suspicious', () => {
  it('flags big jumps, odd reps and a typo set; marked sessions are skipped', () => {
    const fly = stats(ex('E1', 'Fliegende', 'Isolation'), [...sets('2026-11-04', 'E1', 20, [6, 6]), ...sets('2026-11-11', 'E1', 11.25, [10, 10])]);
    const bank = stats(ex('E2', 'Bank'), [...sets('2026-11-02', 'E2', [80, 80, 8], [8, 8, 8]), ...sets('2026-11-09', 'E2', 80, [8, 0])]);
    const ok = stats(ex('E3', 'Ok'), [...sets('2026-11-04', 'E3', 20, [6], { limited: 'Technik' }), ...sets('2026-11-11', 'E3', 11.25, [10])]);
    const list = suspicious([fly, bank, ok]);
    expect(list.map((s) => [s.stats.exercise.name, s.date])).toEqual([['Fliegende', '2026-11-11'], ['Bank', '2026-11-09'], ['Bank', '2026-11-02']]);
    expect(list[0].text).toBe('e1RM −38 % gegenüber 04.11.2026');
    expect(list[1].text).toContain('Satz mit 0 Wdh');
    expect(list[2].text).toContain('ein Satz mit 8 kg');
  });
});
