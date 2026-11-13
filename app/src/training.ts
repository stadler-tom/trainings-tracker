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

/** "zuletzt 4.11. 40 × 8/8/8" or null if there is no regular session yet. */
export function lastText(history: ExerciseHistory | undefined): string | null {
  const last = history?.lastSession;
  if (!last || last.sets.length === 0) return null;
  const sets = [...last.sets].sort((a, b) => a.set - b.set);
  const [, month, day] = last.date.split('-').map(Number);
  return `zuletzt ${day}.${month}. ${formatNumber(sets[0].kg)} × ${sets.map((s) => s.reps).join('/')}`;
}

export interface RecordResult {
  isRecord: boolean;
  kind: 'e1rm' | 'bodyweightReps' | null;   // only an e1RM record shows the record picture
  text: string;                    // e.g. "Neuer Rekord: 45 kg × 8 (e1RM +2,3 kg)"
}

/**
 * Checks one entered set against all earlier regular sets (section 4.5).
 * No record in deload sessions and for the first session of an exercise.
 * With added weight 0 kg (pull-ups at body weight) the highest rep count counts.
 */
export function checkRecord(
  exercise: Exercise, history: ExerciseHistory | undefined, kg: number, reps: number, isDeload: boolean,
): RecordResult {
  const none: RecordResult = { isRecord: false, kind: null, text: '' };
  if (isDeload || !history?.lastSession || !(reps > 0) || !(kg >= 0)) return none;
  if (exercise.weightType === 'Zusatzgewicht' && kg === 0) {
    if (reps > history.bestRepsAtZero) {
      return {
        isRecord: true,
        kind: 'bodyweightReps',
        text: `Neuer Rekord: ${reps} Wdh mit Körpergewicht (+${reps - history.bestRepsAtZero})`,
      };
    }
    return none;
  }
  const value = e1rm(kg, reps);
  if (value > history.bestE1rm + EPSILON) {
    return {
      isRecord: true,
      kind: 'e1rm',
      text: `Neuer Rekord: ${formatNumber(kg)} kg × ${reps} (e1RM +${formatNumber(Math.round((value - history.bestE1rm) * 10) / 10)} kg)`,
    };
  }
  return none;
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

/** Names of the days usually trained on the weekday of the given date. */
export function daysForToday(days: Day[], today = new Date()): string[] {
  return days.filter((day) => usualWeekday(day) === today.getDay()).map((day) => day.name);
}
