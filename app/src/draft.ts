// The running (unsaved) training: kept in localStorage on every change so it
// survives iOS closing the app (requirements spec section 4.2), and turned into
// the saveTraining payload (section 4.3).

import type { SavePayload, State, TrainingDetail } from './api';
import { deloadStatus } from './deload';
import { formatNumber, targetToday } from './training';

export const SET_COUNT = 4;
export const MAX_EXERCISES = 10;     // slots per day sheet

export interface DraftItem {
  id: string;
  name: string;                      // copy, so the draft can be shown without a connection
  kg: string;                        // as typed, with decimal comma
  reps: string[];                    // one entry per set, '' = set not done
  failure: boolean;
}

export interface Draft {
  clientId: string;
  day: string;
  date: string;                      // yyyy-MM-dd
  deload: boolean;
  note: string;
  items: DraftItem[];
  touched: boolean;                  // false = nothing entered yet, not worth keeping
  replaces?: { date: string; day: string };   // set while correcting a saved training
}

const DRAFT_KEY = 'tt.draft';

export function loadDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    return draft && draft.day && Array.isArray(draft.items) ? draft : null;
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

/** Local date as yyyy-MM-dd. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Empty input for one exercise, weight prefilled with today's target. */
export function newItem(state: State, id: string, deload: boolean): DraftItem {
  const exercise = state.exercises.find((e) => e.id === id);
  const target = exercise ? targetToday(exercise, state.history[id], deload) : null;
  // added weight starts at 0 kg (body weight) until there is a last session
  const kg = target?.kg ?? (exercise?.weightType === 'Zusatzgewicht' ? 0 : null);
  return {
    id,
    name: exercise?.name ?? id,
    kg: kg != null ? formatNumber(kg) : '',
    reps: Array(SET_COUNT).fill(''),
    failure: false,
  };
}

/**
 * A saved training opened for correction: same exercises, weights and reps as in the log.
 * Saving it replaces the saved training (API 1.6.0+). One weight per exercise: the first set's.
 */
export function draftFromTraining(detail: TrainingDetail): Draft {
  return {
    clientId: newClientId(),
    day: detail.day,
    date: detail.date,
    deload: detail.deload,
    note: detail.note,
    items: detail.exercises.map((exercise) => {
      const reps = Array.from({ length: SET_COUNT }, () => '');
      exercise.sets.forEach((set) => {
        if (set.set >= 1 && set.set <= SET_COUNT) reps[set.set - 1] = String(set.reps);
      });
      const lastSet = exercise.sets[exercise.sets.length - 1];
      return {
        id: exercise.id,
        name: exercise.name,
        kg: exercise.sets.length ? formatNumber(exercise.sets[0].kg) : '',
        reps,
        failure: lastSet?.failure ?? false,
      };
    }),
    touched: true,                   // kept like a running training until saved or discarded
    replaces: { date: detail.date, day: detail.day },
  };
}

/** Fresh training for a day, in the order of the day sheet; "Deload" is ticked while a deload is due. */
export function newDraft(state: State, day: string, date = todayIso()): Draft {
  const exerciseIds = state.days.find((d) => d.name === day)?.exerciseIds ?? [];
  const deload = deloadStatus(state, date).kind !== 'none';
  return {
    clientId: newClientId(),
    day,
    date,
    deload,
    note: '',
    items: exerciseIds.map((id) => newItem(state, id, deload)),
    touched: false,
  };
}

/** "72,5" -> 72.5; '' or invalid -> null */
export function parseKg(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** itemIndex/field point to the input that needs fixing; field is 'kg' or the set index. */
export type BuildResult =
  | { payload: SavePayload; sets: number }
  | { error: string; itemIndex?: number; field?: 'kg' | number };

/** Checks the inputs and builds the saveTraining payload (section 4.3). */
export function buildPayload(draft: Draft): BuildResult {
  const exercises: SavePayload['exercises'] = [];
  let sets = 0;
  for (const [itemIndex, item] of draft.items.entries()) {
    const filled = item.reps.map((r) => r.trim());
    if (filled.every((r) => r === '')) continue;                 // exercise not done
    const kg = parseKg(item.kg);
    if (kg === null) return { error: `Bei „${item.name}“ fehlt das Gewicht.`, itemIndex, field: 'kg' };
    const reps: (number | null)[] = [];
    for (let i = 0; i < filled.length; i++) {
      if (filled[i] === '') {
        reps.push(null);
        continue;
      }
      const value = Number(filled[i]);
      if (!Number.isInteger(value) || value <= 0) {
        return { error: `Bei „${item.name}“ ist Satz ${i + 1} keine gültige Wiederholungszahl.`, itemIndex, field: i };
      }
      reps.push(value);
      sets++;
    }
    exercises.push({ id: item.id, kg, reps, failure: item.failure });
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
      ...(draft.replaces ? { replaces: draft.replaces } : {}),
    },
  };
}
