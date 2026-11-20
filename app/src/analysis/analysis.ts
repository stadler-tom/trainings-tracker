// Calculations of the PC analysis (requirements spec "PC-Auswertung (Subpage)").
// Pure functions on the data of the read-only action getAnalysis; unit tested in analysis.test.ts.
// The progression rules, e1RM and records come from the app code (training.ts), so both agree.

import type { BodyEntry, Exercise, ExerciseHistory } from '../api';
import { latestBodyWeight, weekStart } from '../body';
import { addDays } from '../format';
import { e1rm, formatNumber, perSetText, targetPerSet, targetToday } from '../training';

/**
 * One logged set: [date, day, exercise ID, set, kg, reps, failure, deload, test, limited]
 * (API 1.7.0; limited since 1.8.0: null, or the reason of "Eingeschränkt", '' without one).
 */
export type LogRow = [string, string, string, number, number, number, boolean, boolean, boolean, (string | null)?];

export interface MuscleGroup {
  name: string;
  setsMin: number | null;
  setsMax: number | null;
}

export interface AnalysisData {
  apiVersion: string;
  days: { name: string; exerciseIds: string[]; weekdays?: number[]; slots?: { id: string; sets: number }[] }[];   // tab order
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  log: LogRow[];
  body: BodyEntry[];
  settings: { deloadWeeks: number; weightTarget: number; perSetWeight?: string };   // perSetWeight 'ja'/'nein' (API 1.8.0+)
}

export interface Session {
  date: string;
  day: string;
  deload: boolean;
  kg: number;                      // weight of set 1
  kgs: number[];                   // weight of every set, in set order (can differ since API 1.8.0)
  reps: number[];                  // in set order
  e1rm: number;                    // best set; with added weight incl. body weight, like the app
  volume: number;                  // sum of kg × reps (like the app's summary)
  isRecord: boolean;               // new best e1RM against all earlier regular sessions (not the first one)
  limited: string | null;          // "Eingeschränkt": the reason ('' without one); kept out of the progression
}

export interface OneRmTest {
  date: string;
  kg: number;
}

export interface ExerciseStats {
  exercise: Exercise;
  sessions: Session[];             // all sessions incl. deload and limited ones, oldest first, without 1RM tests
  regular: Session[];              // sessions without deload and without "Eingeschränkt"
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
  const byKey = new Map<string, { date: string; day: string; deload: boolean; limited: string | null;
    sets: { set: number; kg: number; reps: number; failure: boolean }[] }>();
  const tests: OneRmTest[] = [];
  for (const [date, day, id, set, kg, reps, failure, deload, test, limited] of log) {
    if (id !== exercise.id) continue;
    if (test) { tests.push({ date, kg }); continue; }
    const key = `${date}|${day}`;
    const entry = byKey.get(key) ?? { date, day, deload: false, limited: null, sets: [] };
    entry.deload = entry.deload || deload;
    if (limited != null) entry.limited = limited;
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
        date: entry.date, day: entry.day, deload: entry.deload, kg: sets[0].kg, kgs: sets.map((s) => s.kg), reps: sets.map((s) => s.reps),
        e1rm: value, volume: sets.reduce((sum, s) => sum + s.kg * s.reps, 0), isRecord: false, limited: entry.limited,
      };
      if (!entry.deload && entry.limited === null) {
        session.isRecord = bestSession !== null && value > best + 1e-9;
        if (value > best + 1e-9) { best = value; bestSession = session; }
      }
      return session;
    });
  const regular = sessions.filter((s) => !s.deload && s.limited === null);
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

/**
 * "Nächstes Training": weight for all sets and the rule that raises it (app rules 1–4).
 * Mode "Gewicht pro Satz" (setCount given): the weight of every set, double progression per set.
 */
export function nextTraining(stats: ExerciseStats, setCount: number | null = null): NextTraining {
  const { exercise, history } = stats;
  const target = targetToday(exercise, history, false);
  if (setCount && target.kind !== 'new' && target.kind !== 'warmUp') {
    const sets = targetPerSet(exercise, history, setCount, false);
    return { kg: perSetText(sets).replace(/^↑ /, ''), hint: sets.some((t) => t.up)
      ? 'Sätze am Wdh-Maximum steigen um den Gewichtssprung, die anderen bleiben.'
      : `Jeder Satz steigt, sobald er ${exercise.repsMax} Wdh schafft.` };
  }
  const kgText = (kg: number) => `${formatNumber(kg)} kg`;
  switch (target.kind) {
    case 'new':
      return { kg: '–', hint: `Noch keine Einheit. Wdh-Bereich ${exercise.repsMin}–${exercise.repsMax}.` };
    case 'up':
      return { kg: `${kgText(target.kg!)} (neu)`, hint: `Ziel erreicht – alle Sätze mit dem neuen Gewicht, ${exercise.repsMin}–${exercise.repsMax} Wdh.` };
    case 'down':
      return { kg: `${kgText(target.kg!)} (runter)`,
        hint: `Der beste Satz lag mehr als 2 Wdh unter ${exercise.repsMin}. Mit diesem Gewicht wieder ${exercise.repsMin}+ Wdh schaffen.` };
    case 'warmUp':
      return { kg: kgText(target.kg!), hint: 'Aufwärmübung: kein Steigerungsziel.' };
    default:
      return {
        kg: kgText(target.kg!),
        hint: exercise.increment > 0
          ? `Steigt auf ${kgText(target.kg! + exercise.increment)}, wenn ein Satz ${exercise.repsMax} Wdh schafft und alle Sätze mind. ${exercise.repsMin}.`
          : `Ziel: ein Satz mit ${exercise.repsMax} Wdh.`,
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

/**
 * Number of sets for the per-set target: the most sets of this exercise in any day sheet (API 1.8.0+),
 * else the sets of its last regular session; null when the mode "Gewicht pro Satz" is off.
 */
export function perSetCount(data: AnalysisData, stats: ExerciseStats): number | null {
  if (data.settings.perSetWeight !== 'ja') return null;
  const planned = data.days.flatMap((d) => d.slots ?? []).filter((s) => s.id === stats.exercise.id).map((s) => s.sets);
  if (planned.length) return Math.max(...planned);
  return stats.history.lastSession?.sets.length || 4;
}

/** Distinct trainings (date and day) in a period, both ends included. */
export function trainingCount(log: LogRow[], from: string, to: string): number {
  return new Set(log.filter((r) => r[0] >= from && r[0] <= to).map((r) => `${r[0]}|${r[1]}`)).size;
}

/** "80 kg × 8/8/7", or "80/77,5/75 kg × 8/9/10" when the weights differ. */
export function sessionText(session: Session): string {
  const same = session.kgs.every((kg) => kg === session.kgs[0]);
  const weights = same ? formatNumber(session.kg) : session.kgs.map((kg) => formatNumber(kg)).join('/');
  return `${weights} kg × ${session.reps.join('/')}`;
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

/** Time ranges of the charts (buttons above each chart). */
export const CHART_RANGES = [
  { id: '1w', label: '1 Woche', days: 7 },
  { id: '1m', label: '1 Monat', days: 30 },
  { id: '6m', label: '6 Monate', days: 182 },
  { id: 'all', label: 'Gesamt', days: null },
] as const;
export type ChartRange = (typeof CHART_RANGES)[number]['id'];

/**
 * First day of a range ending today; for "Gesamt" the first date of the data (or today without data).
 * The x axis of a chart then runs from this day to today.
 */
export function rangeStart(range: ChartRange, today: string, firstDate: string | undefined): string {
  const days = CHART_RANGES.find((r) => r.id === range)!.days;
  if (days === null) return firstDate && firstDate < today ? firstDate : today;
  return addDays(today, -(days - 1));
}

/** "6 Monate" etc. for labels such as "Veränderung (6 Monate)". */
export function rangeLabel(range: ChartRange): string {
  return CHART_RANGES.find((r) => r.id === range)!.label;
}
