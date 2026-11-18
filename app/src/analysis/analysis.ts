// Calculations of the PC analysis (requirements spec "PC-Auswertung (Subpage)").
// Pure functions on the data of the read-only action getAnalysis; unit tested in analysis.test.ts.
// The progression rules, e1RM and records come from the app code (training.ts), so both agree.

import type { BodyEntry, Exercise, ExerciseHistory } from '../api';
import { latestBodyWeight, weekStart } from '../body';
import { addDays } from '../format';
import { e1rm, formatNumber, targetToday } from '../training';

/** One logged set: [date, day, exercise ID, set, kg, reps, failure, deload, test] (API 1.7.0). */
export type LogRow = [string, string, string, number, number, number, boolean, boolean, boolean];

export interface MuscleGroup {
  name: string;
  setsMin: number | null;
  setsMax: number | null;
}

export interface AnalysisData {
  apiVersion: string;
  days: { name: string; exerciseIds: string[] }[];   // tab order
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  log: LogRow[];
  body: BodyEntry[];
  settings: { deloadWeeks: number; weightTarget: number };
}

export interface Session {
  date: string;
  day: string;
  deload: boolean;
  kg: number;                      // weight of set 1
  reps: number[];                  // in set order
  e1rm: number;                    // best set; with added weight incl. body weight, like the app
  volume: number;                  // sum of kg × reps (like the app's summary)
  isRecord: boolean;               // new best e1RM against all earlier regular sessions (not the first one)
}

export interface OneRmTest {
  date: string;
  kg: number;
}

export interface ExerciseStats {
  exercise: Exercise;
  sessions: Session[];             // all sessions incl. deload, oldest first, without 1RM tests
  regular: Session[];              // sessions without deload
  tests: OneRmTest[];
  history: ExerciseHistory;        // same shape as the app's state, for targetToday
  best: Session | null;            // record session (highest e1RM)
  status: 'new' | 'rising' | 'stalled' | 'jump';
}

export const STATUS_TEXT: Record<ExerciseStats['status'], string> = {
  new: 'Neu', rising: 'Steigt', stalled: 'Stagniert', jump: 'Sprung fällig',
};
const STALL_SESSIONS = 3;          // this many regular sessions without a new best = stalled

/** Body weight on a date: the last weighing on or before it, else the first one at all (like the web API). */
export function bodyWeightOn(body: BodyEntry[], date: string): number | null {
  const weighings = body.filter((b) => b.weight !== null);
  if (!weighings.length) return null;
  return latestBodyWeight(weighings, date) ?? weighings[0].weight;
}

/** Sessions, tests and status of one exercise. */
export function exerciseStats(exercise: Exercise, log: LogRow[], body: BodyEntry[]): ExerciseStats {
  const addedWeight = exercise.weightType === 'Zusatzgewicht';
  const byKey = new Map<string, { date: string; day: string; deload: boolean; sets: { set: number; kg: number; reps: number; failure: boolean }[] }>();
  const tests: OneRmTest[] = [];
  for (const [date, day, id, set, kg, reps, failure, deload, test] of log) {
    if (id !== exercise.id) continue;
    if (test) { tests.push({ date, kg }); continue; }
    const key = `${date}|${day}`;
    const entry = byKey.get(key) ?? { date, day, deload: false, sets: [] };
    entry.deload = entry.deload || deload;
    entry.sets.push({ set, kg, reps, failure });
    byKey.set(key, entry);
  }
  let best = 0;
  let bestSession: Session | null = null;
  const sessions: Session[] = [...byKey.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((entry) => {
      const sets = [...entry.sets].sort((a, b) => a.set - b.set);
      const bodyWeight = addedWeight ? bodyWeightOn(body, entry.date) ?? 0 : 0;
      const value = Math.max(...sets.map((s) => e1rm(s.kg + bodyWeight, s.reps)));
      const session: Session = {
        date: entry.date, day: entry.day, deload: entry.deload, kg: sets[0].kg, reps: sets.map((s) => s.reps),
        e1rm: value, volume: sets.reduce((sum, s) => sum + s.kg * s.reps, 0), isRecord: false,
      };
      if (!entry.deload) {
        session.isRecord = bestSession !== null && value > best + 1e-9;
        if (value > best + 1e-9) { best = value; bestSession = session; }
      }
      return session;
    });
  const regular = sessions.filter((s) => !s.deload);
  const last = regular[regular.length - 1];
  const lastSets = last ? [...byKey.values()].find((e) => e.date === last.date && e.day === last.day)!.sets : [];
  const history: ExerciseHistory = {
    lastSession: last ? { date: last.date, sets: [...lastSets].sort((a, b) => a.set - b.set) } : null,
    bestE1rm: best,
    bestRepsAtZero: 0,
    bestTest: tests.length ? tests.reduce((a, b) => (b.kg > a.kg ? b : a)) : null,
  };
  let status: ExerciseStats['status'] = 'new';
  if (regular.length >= 2) {
    const target = targetToday(exercise, history, false);
    const recent = regular.slice(-STALL_SESSIONS);
    const stalled = regular.length > STALL_SESSIONS && !recent.some((s) => s.isRecord);
    status = target.kind === 'up' ? 'jump' : stalled ? 'stalled' : 'rising';
  }
  return { exercise, sessions, regular, tests, history, best: bestSession, status };
}

export interface NextTraining {
  kg: string;                      // big line, e.g. "52,5 kg (neu)"
  hint: string;                    // the rule as a sentence
}

/** "Nächstes Training": weight for all sets and the rule that raises it (app rules 1–4). */
export function nextTraining(stats: ExerciseStats): NextTraining {
  const { exercise, history } = stats;
  const target = targetToday(exercise, history, false);
  const kgText = (kg: number) => `${formatNumber(kg)} kg`;
  switch (target.kind) {
    case 'new':
      return { kg: '–', hint: `Noch keine Einheit. Wdh-Bereich ${exercise.repsMin}–${exercise.repsMax}.` };
    case 'up':
      return { kg: `${kgText(target.kg!)} (neu)`, hint: `Ziel erreicht – alle Sätze mit dem neuen Gewicht, ${exercise.repsMin}–${exercise.repsMax} Wdh.` };
    case 'down':
      return { kg: `${kgText(target.kg!)} (runter)`,
        hint: `Satz 1 lag mehr als 2 Wdh unter ${exercise.repsMin}. Mit diesem Gewicht wieder ${exercise.repsMin}+ Wdh schaffen.` };
    case 'warmUp':
      return { kg: kgText(target.kg!), hint: 'Aufwärmübung: kein Steigerungsziel.' };
    default:
      return {
        kg: kgText(target.kg!),
        hint: exercise.increment > 0
          ? `Steigt auf ${kgText(target.kg! + exercise.increment)}, wenn Satz 1 ${exercise.repsMax} Wdh schafft und alle Sätze mind. ${exercise.repsMin}.`
          : `Ziel: Satz 1 auf ${exercise.repsMax} Wdh.`,
      };
  }
}

/** The newest regular session on or before a date, else the first regular session. */
export function sessionAt(stats: ExerciseStats, date: string): Session | null {
  if (!stats.regular.length) return null;
  const before = stats.regular.filter((s) => s.date <= date);
  return before.length ? before[before.length - 1] : stats.regular[0];
}

/** e1RM of sessionAt. */
export function e1rmAt(stats: ExerciseStats, date: string): number | null {
  return sessionAt(stats, date)?.e1rm ?? null;
}

/** e1RM change from the session at `date` to the newest one; null if both are the same session. */
export function e1rmChangeSince(stats: ExerciseStats, date: string): number | null {
  const last = stats.regular[stats.regular.length - 1];
  const then = sessionAt(stats, date);
  return last && then && then !== last ? last.e1rm - then.e1rm : null;
}

/** Monday of every week from the week of `from` to the week of `to`, oldest first. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let week = weekStart(from); week <= to; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

export interface GroupWeek {
  sets: number;
  deload: boolean;
}

/**
 * Working sets per muscle group and week (Monday). Counted: every logged set except 1RM tests
 * and exercises of type "Aufwärmen"; the group is the CURRENT group of the exercise (via its ID).
 * A week counts as deload week if any training in it was a deload.
 */
export function weeklySets(data: AnalysisData, weeks: string[]): Map<string, GroupWeek[]> {
  const groupOf = new Map(data.exercises.filter((e) => e.type !== 'Aufwärmen').map((e) => [e.id, e.muscleGroup]));
  const index = new Map(weeks.map((w, i) => [w, i]));
  const deloadWeeks = new Set<number>();
  const result = new Map<string, GroupWeek[]>();
  const row = (group: string) => {
    if (!result.has(group)) result.set(group, weeks.map(() => ({ sets: 0, deload: false })));
    return result.get(group)!;
  };
  data.muscleGroups.forEach((g) => row(g.name));
  for (const [date, , id, , , , , deload, test] of data.log) {
    const i = index.get(weekStart(date));
    if (i === undefined) continue;
    if (deload) deloadWeeks.add(i);
    const group = groupOf.get(id);
    if (test || !group) continue;
    row(group)[i].sets++;
  }
  for (const values of result.values()) deloadWeeks.forEach((i) => { values[i].deload = true; });
  return result;
}

/** Distinct trainings (date and day) in a period, both ends included. */
export function trainingCount(log: LogRow[], from: string, to: string): number {
  return new Set(log.filter((r) => r[0] >= from && r[0] <= to).map((r) => `${r[0]}|${r[1]}`)).size;
}

/** "−1,7" / "+2,5" with a real minus sign. */
export function signed(value: number, digits = 1): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const text = Math.abs(rounded).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${text}`;
}

/** 107.73 -> "107,7" */
export function oneDecimal(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
