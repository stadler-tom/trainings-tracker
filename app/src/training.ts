// Training calculations (requirements spec "Trainings-App" sections 4.4–4.8).
// Pure functions without side effects so they can be unit tested.
// Progression rules: requirements spec "Trainings-Tracker" section 9.

import type { Day, Exercise, ExerciseHistory } from './api';
import { weekdayOf } from './format';

const DECREASE_TOLERANCE = 2;      // rule 3 only if set 1 is more than this below reps min
const WARM_UP = [                  // share of today's weight × reps
  { share: 0.5, reps: 8 },
  { share: 0.7, reps: 4 },
  { share: 0.85, reps: 2 },
];
const EPSILON = 1e-9;

export type TargetKind = 'new' | 'up' | 'same' | 'down' | 'warmUp' | 'deload';

export interface Target {
  kind: TargetKind;
  kg: number | null;               // weight to prefill, null = nothing known yet
  reps: number | null;             // reps goal for set 1 (shown as placeholder)
  sets: number | null;             // only for deload: number of sets
  text: string;                    // German display text, e.g. "↑ 42,5 kg · 6+"
}

/** Estimated one-rep max (Epley). */
export function e1rm(kg: number, reps: number): number {
  return kg * (1 + reps / 30);
}

/** 26.25 -> "26,25", 40 -> "40" */
export function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

/** Rounds down to a multiple of step (with a small tolerance for floating point). */
function floorTo(value: number, step: number): number {
  return Math.floor(value / step + EPSILON) * step;
}

/** Target for today, derived from the last regular session (rules 1–4 plus special cases). */
export function targetToday(exercise: Exercise, history: ExerciseHistory | undefined, isDeload: boolean): Target {
  const { repsMin, repsMax, increment } = exercise;
  const last = history?.lastSession;
  if (!last || last.sets.length === 0) {
    return { kind: 'new', kg: null, reps: repsMin || null, sets: null, text: `neu · ${repsMin}–${repsMax} Wdh` };
  }
  const sets = [...last.sets].sort((a, b) => a.set - b.set);
  const kg = sets[0].kg;
  const reps = sets.map((s) => s.reps);
  const firstSet = reps[0];

  if (isDeload) {
    const deloadSets = Math.ceil(sets.length / 2);
    return { kind: 'deload', kg, reps: firstSet, sets: deloadSets, text: `Deload ${formatNumber(kg)} kg · ${deloadSets} Sätze` };
  }
  if (exercise.type === 'Aufwärmen') {
    return { kind: 'warmUp', kg, reps: firstSet, sets: null, text: '' };
  }
  if (firstSet >= repsMax && Math.min(...reps) >= repsMin) {                               // rule 2
    const next = kg + increment;
    return { kind: 'up', kg: next, reps: repsMin, sets: null, text: `↑ ${formatNumber(next)} kg · ${repsMin}+` };
  }
  const zeroAddedWeight = exercise.weightType === 'Zusatzgewicht' && kg === 0;
  if (firstSet < repsMin - DECREASE_TOLERANCE && increment > 0 && !zeroAddedWeight) {     // rule 3
    const best = Math.max(...reps.map((r) => e1rm(kg, r)));
    const lower = Math.max(increment, floorTo(best / (1 + repsMin / 30), increment));
    return { kind: 'down', kg: lower, reps: repsMin, sets: null, text: `↓ ${formatNumber(lower)} kg · ${repsMin}+` };
  }
  const goal = Math.min(firstSet + 1, repsMax);                                            // rule 4
  return { kind: 'same', kg, reps: goal, sets: null, text: `= ${formatNumber(kg)} kg · ${goal}+` };
}

export interface SetTarget {
  kg: number | null;               // weight to prefill for this set
  reps: number | null;             // reps goal (placeholder)
  up: boolean;                     // weight raised against the same set last time
}

/**
 * Mode "Gewicht pro Satz" (requirements spec "PC-Auswertung", weight per set): double progression per set.
 * Every set is compared only with the same set of the last regular session; if it reached reps max,
 * its weight goes up by the increment, otherwise it stays and the goal is one rep more.
 * A set the last session did not have takes the values of its last set.
 */
export function targetPerSet(exercise: Exercise, history: ExerciseHistory | undefined, setCount: number, isDeload: boolean): SetTarget[] {
  const last = history?.lastSession;
  const sets = last ? [...last.sets].sort((a, b) => a.set - b.set) : [];
  return Array.from({ length: setCount }, (_, i) => {
    const source = sets[Math.min(i, sets.length - 1)];
    if (!source) return { kg: exercise.weightType === 'Zusatzgewicht' ? 0 : null, reps: exercise.repsMin || null, up: false };
    const raise = !isDeload && exercise.type !== 'Aufwärmen' && exercise.increment > 0 && source.reps >= exercise.repsMax;
    if (raise) return { kg: source.kg + exercise.increment, reps: exercise.repsMin, up: true };
    return { kg: source.kg, reps: isDeload ? source.reps : Math.min(source.reps + 1, exercise.repsMax), up: false };
  });
}

/** "↑ Satz 1: 82,5 kg · Satz 2–3: 80 kg" – sets with the same weight in a row are grouped. */
export function perSetText(targets: SetTarget[]): string {
  if (!targets.length || targets.every((t) => t.kg === null)) return '';
  const parts: string[] = [];
  for (let i = 0; i < targets.length;) {
    let j = i;
    while (j + 1 < targets.length && targets[j + 1].kg === targets[i].kg) j++;
    const label = i === j ? `Satz ${i + 1}` : `Satz ${i + 1}–${j + 1}`;
    parts.push(`${label}: ${targets[i].kg === null ? '–' : `${formatNumber(targets[i].kg as number)} kg`}`);
    i = j + 1;
  }
  return (targets.some((t) => t.up) ? '↑ ' : '') + parts.join(' · ');
}

/** "zuletzt 4.11. 40 × 8/8/8" (or "80/77,5 × 8/8" with different weights), null without a regular session. */
export function lastText(history: ExerciseHistory | undefined): string | null {
  const last = history?.lastSession;
  if (!last || last.sets.length === 0) return null;
  const sets = [...last.sets].sort((a, b) => a.set - b.set);
  const [, month, day] = last.date.split('-').map(Number);
  const weights = sets.every((s) => s.kg === sets[0].kg) ? formatNumber(sets[0].kg) : sets.map((s) => formatNumber(s.kg)).join('/');
  return `zuletzt ${day}.${month}. ${weights} × ${sets.map((s) => s.reps).join('/')}`;
}

export interface RecordResult {
  isRecord: boolean;
  kind: 'weight' | 'test' | null;  // new weight with the minimum reps, or a new best 1RM test; both show the record picture
  text: string;                    // e.g. "Neuer Rekord: 85 kg × 6 (+2,5 kg)"
}

/**
 * Checks one entered set against all earlier regular sets (section 4.5): a record is a new heaviest
 * weight done with at least the minimum reps of the exercise. More reps at the same weight are no record.
 * No record in deload sessions and as long as the minimum reps were never reached before (baseline).
 * Exercises with added weight (pull-ups) compare the added weight.
 */
export function checkRecord(exercise: Exercise, history: ExerciseHistory | undefined, kg: number, reps: number, isDeload: boolean): RecordResult {
  const none: RecordResult = { isRecord: false, kind: null, text: '' };
  const best = history?.bestKgAtMin ?? null;
  if (isDeload || best === null || !(kg >= 0)) return none;
  if (!(reps >= Math.max(exercise.repsMin, 1))) return none;
  if (!(kg > best + EPSILON)) return none;
  const load = exercise.weightType === 'Zusatzgewicht' ? `Körpergewicht + ${formatNumber(kg)} kg` : `${formatNumber(kg)} kg`;
  return {
    isRecord: true,
    kind: 'weight',
    text: `Neuer Rekord: ${load} × ${reps} (+${formatNumber(Math.round((kg - best) * 100) / 100)} kg)`,
  };
}

/**
 * A 1RM test is a record if it beats every earlier test of the exercise; the first test counts too
 * (requirements spec "PC-Auswertung", 1RM-Test). Tests never count against e1RM records.
 */
export function checkTestRecord(history: ExerciseHistory | undefined, kg: number): RecordResult {
  if (!(kg > 0)) return { isRecord: false, kind: null, text: '' };
  const best = history?.bestTest?.kg ?? null;
  if (best === null) return { isRecord: true, kind: 'test', text: `Neues 1RM: ${formatNumber(kg)} kg (erster Test)` };
  if (kg > best + EPSILON) {
    return { isRecord: true, kind: 'test', text: `Neues 1RM: ${formatNumber(kg)} kg (+${formatNumber(Math.round((kg - best) * 100) / 100)} kg)` };
  }
  return { isRecord: false, kind: null, text: '' };
}

export interface PlateLoad {
  perSide: number[];               // plates on one side, largest first
  loadedTotal: number;             // bar + both sides
  missing: number;                 // > 0 if the weight cannot be loaded exactly
}

/** Plates per side for a total weight on a bar (section 4.7): as few and as large plates as possible. */
export function platesPerSide(total: number, bar: number, plates: number[]): PlateLoad {
  const sorted = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  let rest = Math.max(0, (total - bar) / 2);
  const perSide: number[] = [];
  for (const plate of sorted) {
    while (rest + EPSILON >= plate) {
      perSide.push(plate);
      rest -= plate;
    }
  }
  const loadedTotal = bar + 2 * perSide.reduce((sum, p) => sum + p, 0);
  return { perSide, loadedTotal, missing: Math.round((total - loadedTotal) * 1000) / 1000 };
}

export interface WarmUpSet {
  kg: number;
  reps: number;
}

/** Warm-up suggestion for compound lifts (section 4.8); empty without a target weight. */
export function warmUpSets(exercise: Exercise, targetKg: number | null): WarmUpSet[] {
  if (exercise.type !== 'Grundübung' || !targetKg || targetKg <= 0) return [];
  const step = exercise.increment > 0 ? exercise.increment : 0.5;
  const bar = exercise.barWeight ?? 0;
  return WARM_UP.map(({ share, reps }) => ({ kg: Math.max(bar, floorTo(targetKg * share, step)), reps }));
}

/** One −/+ step; never below 0, no rounding to a grid (section 4.2). */
export function stepValue(value: number | null, step: number, direction: 1 | -1): number {
  const next = (value ?? 0) + direction * step;
  return Math.max(0, Math.round(next * 1000) / 1000);
}

/**
 * The weekday a training day is usually done on: the most frequent weekday of its
 * recent trainings (newest first). On a tie the older weekday stays, so one moved
 * training does not move the hint. null without trainings.
 * Older web APIs only send lastDate, then that one date decides.
 */
export function usualWeekday(day: Day): number | null {
  const dates = day.recentDates ?? (day.lastDate ? [day.lastDate] : []);
  const counts = new Map<number, number>();
  for (const date of dates) {
    const weekday = weekdayOf(date);
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const date of [...dates].reverse()) {  // oldest first, so a tie keeps the older weekday
    const weekday = weekdayOf(date);
    if (best === null || counts.get(weekday)! > counts.get(best)!) best = weekday;
  }
  return best;
}

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];   // ISO order, Monday = 1

/**
 * Names of the days trained on the weekday of the given date: the weekdays chosen in the day sheet
 * (API 1.8.0+); a day without a chosen weekday falls back to the usual weekday from the log.
 */
export function daysForToday(days: Day[], today = new Date()): string[] {
  const iso = ((today.getDay() + 6) % 7) + 1;
  return days.filter((day) => (day.weekdays?.length ? day.weekdays.includes(iso) : usualWeekday(day) === today.getDay()))
    .map((day) => day.name);
}

/** "Push (Mo, Mi)" – the weekdays chosen in the day sheet; just the name without any. */
export function dayLabel(day: Day): string {
  const names = (day.weekdays ?? []).filter((n) => n >= 1 && n <= 7).map((n) => WEEKDAY_SHORT[n - 1]);
  return names.length ? `${day.name} (${names.join(', ')})` : day.name;
}

/**
 * Days in week order: by their earliest weekday from the day sheet (Monday first).
 * Days without a weekday come last; equal days keep the order of the sheet tabs.
 */
export function sortDaysByWeekday(days: Day[]): Day[] {
  const first = (day: Day) => Math.min(8, ...(day.weekdays ?? []).filter((n) => n >= 1 && n <= 7));
  return [...days].sort((a, b) => first(a) - first(b));
}

/** Names of the days with a training saved for the given date (the newest log entry is today). */
export function daysDoneToday(days: Day[], todayIso: string): string[] {
  return days.filter((day) => day.lastDate === todayIso).map((day) => day.name);
}
