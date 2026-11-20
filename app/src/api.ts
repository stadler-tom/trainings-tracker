// Calls to the user's web API (requirements spec section 5).
// The body is sent as text/plain so the browser does not need a CORS preflight.

import type { AnalysisData } from './analysis/analysis';
import type { Settings } from './storage';

export const MIN_API_VERSION = '1.8.1';     // 1.8.1: bestKgAtMin for records; 1.8.0: weight per set in saveTraining, day sheets with weekdays and sets
export const UPDATE_GUIDE_URL = 'https://github.com/stadler-tom/trainings-tracker/blob/main/template/UPDATE.md';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  type: string;
  repsMin: number;
  repsMax: number;
  increment: number;
  weightType: string;
  active: boolean;
  note: string;
  barWeight: number | null;
}

export interface LoggedSet {
  set: number;
  kg: number;
  reps: number;
  failure: boolean;
}

export interface ExerciseHistory {
  lastSession: { date: string; sets: LoggedSet[] } | null;
  bestE1rm: number;
  bestRepsAtZero: number;
  bestKgAtMin?: number | null;                     // heaviest weight with at least the minimum reps, null if never reached (API 1.8.1+)
  recentE1rm?: { date: string; e1rm: number }[];   // last sessions without deload, oldest first (API 1.5.0+)
  bestTest?: { kg: number; date: string } | null;  // best 1RM test, never part of the progression (API 1.7.0+)
}

export interface Session {
  date: string;
  deload: boolean;
}

/** One saved training in the history list (API 1.6.0+). */
export interface TrainingOverview {
  date: string;                    // yyyy-MM-dd
  day: string;
  deload: boolean;
  sets: number;
  volume: number;                  // sum of kg × reps
  exercises: number;
}

/** One day of sheet "Körper" (API 1.6.0+). */
export interface BodyEntry {
  date: string;                    // yyyy-MM-dd
  weight: number | null;           // kg
  waist: number | null;            // cm
}

/** One saved training with all sets (action getTraining, API 1.6.0+). */
export interface TrainingDetail {
  date: string;
  day: string;
  deload: boolean;
  note: string;
  exercises: {
    id: string;
    name: string;
    sets: (LoggedSet & { e1rm: number; isPr: boolean; test?: boolean })[];   // test: 1RM test, e1rm = kg (API 1.7.0+)
    limited?: string;              // marked "Eingeschränkt": the reason, '' without one (API 1.8.0+)
    drops?: { drop: number; kg: number; reps: number }[];   // drop sets after the last set (API 1.10.0+)
  }[];
}

export interface Day {
  name: string;
  lastDate: string | null;
  recentDates?: string[];          // last trainings, newest first (API 1.3.0+)
  exerciseIds: string[];
  weekdays?: number[];             // chosen in the day sheet, ISO numbers: Monday = 1 … Sunday = 7 (API 1.8.0+)
  slots?: DaySlot[];               // exercises with their number of sets (API 1.8.0+)
}

export interface DaySlot {
  id: string;
  sets: number;                    // 1–5
  superset?: boolean;              // forms a superset with the next exercise (API 1.10.0+)
}

/** Script version from which supersets and drop sets can be saved. */
export const SUPERSET_DROP_VERSION = '1.10.0';

export interface State {
  apiVersion: string;
  days: Day[];
  exercises: Exercise[];
  history: Record<string, ExerciseHistory>;
  sessions?: Session[];            // every training date, oldest first (API 1.5.0+)
  deloadWeeks?: number;            // sheet "Einstellungen" (API 1.5.0+)
  trainings?: TrainingOverview[];  // newest first (API 1.6.0+)
  body?: BodyEntry[];              // oldest first (API 1.6.0+)
  weightTarget?: number;           // kg per week, sheet "Einstellungen" (API 1.6.0+)
  perSetWeight?: boolean;          // sheet "Einstellungen": one weight field per set (API 1.8.0+)
  settings?: GlobalSetting[];      // all rows of sheet "Einstellungen", editable in the app (API 1.9.0+)
}

/** One setting of sheet "Einstellungen": a number with limits, or a choice such as ja/nein. */
export interface GlobalSetting {
  key: string;
  label: string;
  help: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export class ApiError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_key: 'Der Schlüssel ist falsch. Bitte in den Einstellungen prüfen.',
  network: 'Keine Verbindung zum Web-API. Bitte Netz prüfen, ob die Adresse auf /exec endet und ob der Zugriff der Bereitstellung auf „Jeder“ steht.',
  dev_url: 'Die Adresse endet auf /dev. Das ist die Test-Adresse des Editors; bitte die Web-App-URL auf /exec aus „Bereitstellungen verwalten“ eintragen.',
  not_configured: 'Web-API-Adresse und Schlüssel fehlen. Bitte in den Einstellungen eintragen.',
  invalid_response: 'Das Web-API hat unerwartet geantwortet. Ist die Adresse richtig?',
  already_saved: 'Dieser Trainingstag ist für das Datum schon gespeichert. Korrekturen bitte direkt im Sheet im Log.',
  unknown_training: 'Dieses Training gibt es im Sheet nicht mehr. Wurde es dort geändert oder gelöscht?',
  invalid_body: 'Bitte Gewicht zwischen 30 und 250 kg bzw. Bauchumfang zwischen 40 und 250 cm eintragen.',
  missing_weight: 'Bei einer Übung fehlt das Gewicht',
  invalid_reps: 'Bei einer Übung ist eine Wiederholungszahl ungültig',
  invalid_test: 'Ein 1RM-Test hat genau einen Satz mit 1 Wiederholung',
  invalid_drop: 'Höchstens 3 Drop-Sätze, und keiner bei einem 1RM-Test',
  invalid_setting: 'Ungültiger Wert bei der Einstellung',
  nothing_to_save: 'Es ist noch kein Satz eingetragen.',
  busy: 'Das Sheet ist gerade beschäftigt. Bitte gleich noch einmal versuchen.',
  unknown_exercise: 'Eine Übung fehlt im Übungsstamm des Sheets.',
  unknown_day: 'Diesen Trainingstag gibt es im Sheet nicht mehr. Wurde das Tagesblatt gelöscht? Die Eingaben bleiben erhalten.',
  invalid_date: 'Das Datum ist ungültig.',
  too_many_exercises: 'Ein Trainingstag hat höchstens 15 Übungen.',
  missing_client_id: 'Die App hat eine unvollständige Anfrage gesendet. Bitte die Seite neu laden.',
  unknown_action: 'Das Script im Sheet ist zu alt für diese App. Bitte das Script aktualisieren.',
  server_error: 'Im Script des Sheets ist ein Fehler aufgetreten',
};

/** German message for an error, for display in the app. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const base = MESSAGES[error.code] ?? `Fehler im Web-API (${error.code}).`;
    return error.detail ? `${base}: ${error.detail}` : base;
  }
  return MESSAGES.network;
}

/** Duration of the last request per action: total in the app and the part spent in the script. */
export interface Timing {
  totalMs: number;
  scriptMs: number | null;       // null with web APIs before 1.4.0
  at: string;                    // ISO time of the request
}

const TIMINGS_KEY = 'tt.timings';

export function loadTimings(): Record<string, Timing> {
  try {
    return JSON.parse(localStorage.getItem(TIMINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function rememberTiming(action: string, timing: Timing) {
  try {
    localStorage.setItem(TIMINGS_KEY, JSON.stringify({ ...loadTimings(), [action]: timing }));
  } catch {
    // ignore
  }
}

async function call<T>(settings: Settings, action: string, payload: object = {}): Promise<T> {
  if (!settings.apiUrl || !settings.apiKey) throw new ApiError('not_configured');
  if (settings.apiUrl.endsWith('/dev')) throw new ApiError('dev_url');
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: settings.apiKey, action, payload }),
    });
  } catch {
    throw new ApiError('network');
  }
  let body: { ok: boolean; data?: T; error?: string; detail?: string; ms?: number };
  try {
    body = await response.json();
  } catch {
    throw new ApiError('invalid_response');
  }
  rememberTiming(action, {
    totalMs: Math.round(performance.now() - started), scriptMs: body.ms ?? null, at: new Date().toISOString(),
  });
  if (!body.ok) throw new ApiError(body.error ?? 'unknown', body.detail);
  return body.data as T;
}

export const ping = (settings: Settings) =>
  call<{ apiVersion: string; sheetName: string }>(settings, 'ping');

export const getState = (settings: Settings) => call<State>(settings, 'getState');

/** true if version a is lower than version b (Major.Minor.Patch). */
export function isOlderVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

export interface SavePayload {
  clientId: string;
  day: string;
  date: string;                                  // yyyy-MM-dd
  deload: boolean;
  note: string;
  exercises: SaveExercise[];
}

/** One exercise of a saved training (API 1.8.0+: a weight per set). */
export interface SaveExercise {
  id: string;
  sets: { kg: number; reps: number }[];          // only the sets done, in order
  failure: boolean;                              // marks the last set
  test?: boolean;                                // 1RM test: one set with 1 rep (API 1.7.0+)
  limited?: string | null;                       // "Eingeschränkt": the reason ('' allowed), null = normal (API 1.8.0+)
  drops?: { kg: number; reps: number }[];        // drop sets after the last set, at most 3 (API 1.10.0+)
}

export const saveTraining = (settings: Settings, payload: SavePayload) =>
  call<{ savedSets?: number; duplicate?: boolean; state?: State }>(settings, 'saveTraining', payload);   // state since 1.4.0

export const updateDaySlots = (settings: Settings, day: string, exerciseIds: string[], supersets: string[] = []) =>
  call<{ exerciseIds: string[]; slots?: DaySlot[] }>(settings, 'updateDaySlots', { day, exerciseIds, supersets });   // supersets: API 1.10.0+

export const updateExerciseNote = (settings: Settings, id: string, note: string) =>
  call<{ id: string }>(settings, 'updateExerciseNote', { id, note });

export const getTraining = (settings: Settings, date: string, day: string) =>
  call<TrainingDetail>(settings, 'getTraining', { date, day });

export const saveBody = (settings: Settings, date: string, weight: number | null, waist: number | null) =>
  call<{ body: BodyEntry[] }>(settings, 'saveBody', { date, weight, waist });

/** Writes settings into sheet "Einstellungen" and returns the fresh state (API 1.9.0+). */
export const updateSettings = (settings: Settings, values: Record<string, number | string>) =>
  call<{ state: State }>(settings, 'updateSettings', { values });

/** Everything the PC analysis needs, read-only (API 1.7.0+). */
export const getAnalysis = (settings: Settings) => call<AnalysisData>(settings, 'getAnalysis');
