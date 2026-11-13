import { describe, expect, it } from 'vitest';
import type { ExerciseHistory, Session, State } from './api';
import { deloadStatus } from './deload';

/** Trainings every 2 days from `from` (inclusive) for `count` sessions. */
function every2Days(from: string, count: number, deload = false): Session[] {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.parse(from) + i * 2 * 86_400_000).toISOString().slice(0, 10),
    deload,
  }));
}

function state(sessions: Session[], history: Record<string, ExerciseHistory> = {}, deloadWeeks?: number): State {
  return { apiVersion: '1.5.0', days: [], exercises: [], history, sessions, deloadWeeks };
}

function dropping(dates: string[]): ExerciseHistory {
  return {
    lastSession: null, bestE1rm: 100, bestRepsAtZero: 0,
    recentE1rm: [{ date: dates[0], e1rm: 100 }, { date: dates[1], e1rm: 98 }, { date: dates[2], e1rm: 95 }],
  };
}

describe('deloadStatus', () => {
  it('nothing without data (older script)', () => {
    expect(deloadStatus(state([]), '2026-11-13').kind).toBe('none');
    expect(deloadStatus({ apiVersion: '1.4.0', days: [], exercises: [], history: {} }, '2026-11-13').kind).toBe('none');
  });

  it('due after 8 weeks without deload', () => {
    const s = every2Days('2026-09-01', 28);           // up to 2026-10-25
    expect(deloadStatus(state(s), '2026-10-26').kind).toBe('none');   // 7 weeks
    const due = deloadStatus(state(s), '2026-10-27');                  // 8 weeks
    expect(due.kind).toBe('due');
    expect(due.reason).toBe('Seit 8 Wochen kein Deload.');
  });

  it('uses the interval from the sheet', () => {
    const s = every2Days('2026-09-01', 22);
    expect(deloadStatus(state(s, {}, 6), '2026-10-13').kind).toBe('due');
  });

  it('a break of 7 days starts a new block', () => {
    const s = [...every2Days('2026-08-01', 20), ...every2Days('2026-09-20', 10)];
    expect(deloadStatus(state(s), '2026-10-08').kind).toBe('none');
  });

  it('no hint after a break that is still going on', () => {
    const s = every2Days('2026-08-01', 30);           // last training 2026-09-28
    expect(deloadStatus(state(s), '2026-10-06').kind).toBe('none');
  });

  it('due earlier when 3 exercises drop twice in a row, but not before 4 weeks', () => {
    const s = every2Days('2026-10-01', 16);           // up to 2026-10-31
    const d = ['2026-10-25', '2026-10-27', '2026-10-29'];
    const history = { A: dropping(d), B: dropping(d), C: dropping(d) };
    expect(deloadStatus(state(s, history), '2026-10-28').kind).toBe('none');   // 3 weeks
    const due = deloadStatus(state(s, history), '2026-10-29');                 // 4 weeks
    expect(due.kind).toBe('due');
    expect(due.reason).toBe('Bei 3 Übungen sinkt die Leistung seit 2 Einheiten.');
  });

  it('two dropping exercises are not enough', () => {
    const s = every2Days('2026-10-01', 16);
    const d = ['2026-10-25', '2026-10-27', '2026-10-29'];
    expect(deloadStatus(state(s, { A: dropping(d), B: dropping(d) }), '2026-11-01').kind).toBe('none');
  });

  it('drops from before the block do not count', () => {
    const s = [...every2Days('2026-09-01', 5, true), ...every2Days('2026-09-11', 20)];
    const d = ['2026-09-01', '2026-09-03', '2026-09-05'];
    const history = { A: dropping(d), B: dropping(d), C: dropping(d) };
    expect(deloadStatus(state(s, history), '2026-10-20').kind).toBe('none');
  });

  it('deload week stays active for 7 days, then the next training starts a new block', () => {
    const s = [...every2Days('2026-09-01', 28), { date: '2026-10-28', deload: true }];
    const active = deloadStatus(state(s), '2026-11-03');
    expect(active.kind).toBe('active');
    expect(active.reason).toBe('Deload-Woche läuft bis 03.11.2026.');
    expect(deloadStatus(state(s), '2026-11-04').kind).toBe('none');
    const next = [...s, { date: '2026-11-05', deload: false }];
    expect(deloadStatus(state(next), '2026-11-06').kind).toBe('none');
  });
});
