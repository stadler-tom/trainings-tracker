// Calls to the user's web API (requirements spec section 5).
// The body is sent as text/plain so the browser does not need a CORS preflight.

import type { Settings } from './storage';

export const MIN_API_VERSION = '1.0.0';

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
}

export interface Day {
  name: string;
  lastDate: string | null;
  exerciseIds: string[];
}

export interface State {
  apiVersion: string;
  days: Day[];
  exercises: Exercise[];
  history: Record<string, ExerciseHistory>;
}

export class ApiError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_key: 'Der Schlüssel ist falsch. Bitte in den Einstellungen prüfen.',
  network: 'Keine Verbindung zum Web-API. Netz und Adresse prüfen.',
  not_configured: 'Web-API-Adresse und Schlüssel fehlen. Bitte in den Einstellungen eintragen.',
  invalid_response: 'Das Web-API hat unerwartet geantwortet. Ist die Adresse richtig?',
  already_saved: 'Dieser Trainingstag ist für das Datum schon gespeichert. Korrekturen bitte direkt im Sheet.',
  missing_weight: 'Bei einer Übung fehlt das Gewicht',
  invalid_reps: 'Bei einer Übung ist eine Wiederholungszahl ungültig',
  nothing_to_save: 'Es ist noch kein Satz eingetragen.',
  busy: 'Das Sheet ist gerade beschäftigt. Bitte gleich noch einmal versuchen.',
  unknown_exercise: 'Eine Übung fehlt im Übungsstamm des Sheets.',
  unknown_day: 'Diesen Trainingstag gibt es im Sheet nicht.',
};

/** German message for an error, for display in the app. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const base = MESSAGES[error.code] ?? `Fehler im Web-API (${error.code}).`;
    return error.detail ? `${base}: ${error.detail}` : base;
  }
  return MESSAGES.network;
}

async function call<T>(settings: Settings, action: string, payload: object = {}): Promise<T> {
  if (!settings.apiUrl || !settings.apiKey) throw new ApiError('not_configured');
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
  let body: { ok: boolean; data?: T; error?: string; detail?: string };
  try {
    body = await response.json();
  } catch {
    throw new ApiError('invalid_response');
  }
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
