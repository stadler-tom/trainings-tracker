// The running (unsaved) training: kept in localStorage on every change so it
// survives iOS closing the app (requirements spec section 4.2), and turned into
// the saveTraining payload (section 4.3).

import type { SaveExercise, SavePayload, State } from './api';
import { deloadStatus } from './deload';
import { todayIso } from './format';

export { todayIso };      // kept here for existing imports
import { formatNumber, targetPerSet, targetToday } from './training';

export const SET_COUNT = 4;          // default number of sets (day sheets from API 1.8.0 set 1–5 per exercise)
export const MAX_EXERCISES = 15;     // slots per day sheet
export const MAX_DROPS = 3;          // drop sets after the last set (API 1.10.0+)
export const DROP_FACTOR = 0.8;      // a new drop starts 20 % lighter than the weight before it

export interface DraftItem {
  id: string;
  name: string;                      // copy, so the draft can be shown without a connection
  kg: string;                        // as typed, with decimal comma; the weight of all sets (and of a 1RM test)
  kgs?: string[];                    // mode "Gewicht pro Satz": one weight per set
  reps: string[];                    // one entry per set, '' = set not done; its length is the number of sets
  failure: boolean;
  test?: boolean;                    // 1RM test: one set with 1 rep, kept out of the progression
  limited?: boolean;                 // "Eingeschränkt": pain or stopped early, kept out of the progression
  reason?: string;                   // optional reason for "Eingeschränkt"
  superset?: boolean;                // forms a superset with the next exercise (API 1.10.0+)
  drops?: { kg: string; reps: string }[];   // drop sets after the last set, as typed (API 1.10.0+)
}

export interface Draft {
  clientId: string;
  day: string;
  date: string;                      // yyyy-MM-dd
  deload: boolean;
  deloadChosen?: boolean;            // true once the user ticked or unticked "Deload" by hand
  note: string;
  items: DraftItem[];
  touched: boolean;                  // false = nothing entered yet, not worth keeping
  perSet?: boolean;                  // mode "Gewicht pro Satz" when the training was started
}

const DRAFT_KEY = 'tt.draft';

export function loadDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (!draft || !draft.day || !Array.isArray(draft.items)) return null;
    // drafts from before 1.8: one weight per exercise only
    for (const item of draft.items as DraftItem[]) item.kgs ??= item.reps.map(() => item.kg);
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage unavailable: the draft lives in memory only
  }
}

export function removeDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}


/**
 * Empty input for one exercise with the given number of sets, weights prefilled with today's target:
 * one weight for all sets, or in mode "Gewicht pro Satz" one weight per set (double progression per set).
 */
export function newItem(state: State, id: string, deload: boolean, setCount = SET_COUNT): DraftItem {
  const exercise = state.exercises.find((e) => e.id === id);
  const target = exercise ? targetToday(exercise, state.history[id], deload) : null;
  // added weight starts at 0 kg (body weight) until there is a last session
  const kg = target?.kg ?? (exercise?.weightType === 'Zusatzgewicht' ? 0 : null);
  const kgText = kg != null ? formatNumber(kg) : '';
  const perSet = exercise && state.perSetWeight ? targetPerSet(exercise, state.history[id], setCount, deload) : null;
  return {
    id,
    name: exercise?.name ?? id,
    kg: kgText,
    kgs: perSet ? perSet.map((t) => (t.kg != null ? formatNumber(t.kg) : '')) : Array(setCount).fill(kgText),
    reps: Array(setCount).fill(''),
    failure: false,
  };
}

/** Exercises of a day with their number of sets (API 1.8.0+), else 4 sets each. */
export function daySlots(state: State, day: string): { id: string; sets: number; superset?: boolean }[] {
  const entry = state.days.find((d) => d.name === day);
  if (!entry) return [];
  return entry.slots ?? entry.exerciseIds.map((id) => ({ id, sets: SET_COUNT }));
}

/** Fresh training for a day, in the order of the day sheet; "Deload" is ticked while a deload is due. */
export function newDraft(state: State, day: string, date = todayIso()): Draft {
  const deload = deloadStatus(state, date).kind !== 'none';
  return {
    clientId: newClientId(),
    day,
    date,
    deload,
    note: '',
    items: daySlots(state, day).map((slot) => ({ ...newItem(state, slot.id, deload, slot.sets), superset: slot.superset === true })),
    touched: false,
    perSet: state.perSetWeight === true,
  };
}

/** "72,5" -> 72.5; '' or invalid -> null */
export function parseKg(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Input that needs fixing: the date, or in exercise itemIndex the weight ('kg'),
 * the weight of one set ('kg-<index>', mode "Gewicht pro Satz"), the reps of one set (its index),
 * or the weight or reps of a drop set ('drop-kg-<index>', 'drop-<index>').
 */
export type InvalidField = 'date' | 'kg' | `kg-${number}` | `drop-kg-${number}` | `drop-${number}` | number;

/**
 * Weight of a new drop: 20 % below the weight before it (the last drop, else the last set),
 * rounded down to the exercise's weight step (0,5 kg without one); '' if nothing sensible is left.
 */
export function dropKg(item: DraftItem, perSet: boolean, increment: number): string {
  const lastDrop = item.drops?.[item.drops.length - 1];
  let base = lastDrop ? parseKg(lastDrop.kg) : null;
  if (base === null) {
    const done = item.reps.map((r, i) => (r.trim() !== '' ? i : -1)).filter((i) => i >= 0);
    const index = done.length ? done[done.length - 1] : item.reps.length - 1;
    base = parseKg(perSet ? item.kgs?.[index] ?? '' : item.kg);
  }
  if (base === null || base <= 0) return '';
  const step = increment > 0 ? increment : 0.5;
  const kg = Math.floor((base * DROP_FACTOR) / step + 1e-9) * step;
  return kg > 0 ? formatNumber(Math.round(kg * 1000) / 1000) : '';
}

export type BuildResult =
  | { payload: SavePayload; sets: number }
  | { error: string; itemIndex?: number; field?: InvalidField };

/** Checks the inputs and builds the saveTraining payload (section 4.3). */
export function buildPayload(draft: Draft): BuildResult {
  const exercises: SavePayload['exercises'] = [];
  let sets = 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return { error: 'Bitte ein Datum wählen.', field: 'date' };
  if (draft.date > todayIso()) return { error: 'Das Datum liegt in der Zukunft.', field: 'date' };
  for (const [itemIndex, item] of draft.items.entries()) {
    if (item.test) {                                             // 1RM test: weight only, always 1 rep
      const kg = parseKg(item.kg);
      if (kg === null) return { error: `Beim 1RM-Test „${item.name}“ fehlt das Gewicht.`, itemIndex, field: 'kg' };
      exercises.push({ id: item.id, sets: [{ kg, reps: 1 }], failure: false, test: true });
      sets++;
      continue;
    }
    const filled = item.reps.map((r) => r.trim());
    const drops = (item.drops ?? []).map((d) => ({ kg: d.kg.trim(), reps: d.reps.trim() }));
    if (filled.every((r) => r === '')) {
      if (drops.some((d) => d.reps !== '')) return { error: `Bei „${item.name}“ gibt es einen Drop-Satz, aber keinen normalen Satz.`, itemIndex, field: 0 };
      continue;                                                  // exercise not done
    }
    const shared = draft.perSet ? null : parseKg(item.kg);
    if (!draft.perSet && shared === null) return { error: `Bei „${item.name}“ fehlt das Gewicht.`, itemIndex, field: 'kg' };
    const done: SaveExercise['sets'] = [];
    for (let i = 0; i < filled.length; i++) {
      if (filled[i] === '') continue;
      const value = Number(filled[i]);
      if (!Number.isInteger(value) || value <= 0) {
        return { error: `Bei „${item.name}“ ist Satz ${i + 1} keine gültige Wiederholungszahl.`, itemIndex, field: i };
      }
      const kg = draft.perSet ? parseKg(item.kgs?.[i] ?? '') : shared;
      if (kg === null) return { error: `Bei „${item.name}“ fehlt in Satz ${i + 1} das Gewicht.`, itemIndex, field: `kg-${i}` };
      done.push({ kg, reps: value });
      sets++;
    }
    const doneDrops: { kg: number; reps: number }[] = [];
    for (const [i, drop] of drops.entries()) {
      if (drop.reps === '') continue;                            // drop prepared but not done
      const value = Number(drop.reps);
      if (!Number.isInteger(value) || value <= 0) {
        return { error: `Bei „${item.name}“ ist Drop ${i + 1} keine gültige Wiederholungszahl.`, itemIndex, field: `drop-${i}` };
      }
      const kg = parseKg(drop.kg);
      if (kg === null) return { error: `Bei „${item.name}“ fehlt bei Drop ${i + 1} das Gewicht.`, itemIndex, field: `drop-kg-${i}` };
      doneDrops.push({ kg, reps: value });
    }
    exercises.push({ id: item.id, sets: done, failure: item.failure, limited: item.limited ? (item.reason ?? '').trim() : null,
      ...(doneDrops.length ? { drops: doneDrops } : {}) });
  }
  if (sets === 0) return { error: 'Es ist noch kein Satz eingetragen.' };
  return {
    sets,
    payload: {
      clientId: draft.clientId,
      day: draft.day,
      date: draft.date,
      deload: draft.deload,
      note: draft.note.trim(),
      exercises,
    },
  };
}
