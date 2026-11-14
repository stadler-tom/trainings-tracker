// When is a deload week due? Pure function, unit tested in deload.test.ts.
// Rules (decided with Tom, based on Bell et al. 2022/2023 and Coleman et al. 2024):
// - a block starts with the first training, after a deload or after a break of 7+ days,
// - due at the latest after `deloadWeeks` weeks (sheet "Einstellungen", default 8),
// - due earlier, but not before 4 weeks, when the e1RM of at least 3 exercises
//   dropped in 2 sessions in a row,
// - the deload week lasts 7 days from its first training; meanwhile the box stays ticked.

import type { Session, State } from './api';
import { addDays, daysBetween, formatIsoDate } from './format';

export const DEFAULT_DELOAD_WEEKS = 8;
const MIN_WEEKS_FOR_DROP = 4;
const MIN_EXERCISES_DROPPING = 3;
const BREAK_DAYS = 7;
const DELOAD_WEEK_DAYS = 7;

export interface DeloadStatus {
  kind: 'none' | 'due' | 'active';
  reason: string;                  // German, shown under the hint
}

const NONE: DeloadStatus = { kind: 'none', reason: '' };

/** First training of the current block (after a deload or a break). */
function blockStart(sessions: Session[]): string {
  let start = sessions[0].date;
  for (let i = 1; i < sessions.length; i++) {
    const afterDeload = sessions[i - 1].deload && !sessions[i].deload;
    const afterBreak = daysBetween(sessions[i - 1].date, sessions[i].date) >= BREAK_DAYS;
    if (afterDeload || afterBreak) start = sessions[i].date;
  }
  return start;
}

/** Number of exercises whose e1RM dropped in the last 2 sessions of this block. */
function exercisesDropping(state: State, start: string): number {
  return Object.values(state.history).filter((h) => {
    // the last 3 sessions of this block (the web API sends up to 8)
    const recent = (h.recentE1rm ?? []).filter((s) => s.date >= start && s.e1rm > 0).slice(-3);
    return recent.length === 3 && recent[1].e1rm < recent[0].e1rm && recent[2].e1rm < recent[1].e1rm;
  }).length;
}

export function deloadStatus(state: State, today: string): DeloadStatus {
  const sessions = state.sessions ?? [];
  if (!sessions.length) return NONE;
  const last = sessions[sessions.length - 1];

  // deload week running: the newest trainings are deloads
  if (last.deload) {
    let first = sessions.length - 1;
    while (first > 0 && sessions[first - 1].deload) first--;
    const weekEnd = addDays(sessions[first].date, DELOAD_WEEK_DAYS - 1);
    return today <= weekEnd
      ? { kind: 'active', reason: `Deload-Woche läuft bis ${formatIsoDate(weekEnd)}.` }
      : NONE;
  }
  if (daysBetween(last.date, today) >= BREAK_DAYS) return NONE;   // a break is a deload, too

  const start = blockStart(sessions);
  const weeks = Math.floor(daysBetween(start, today) / 7);
  if (weeks >= (state.deloadWeeks ?? DEFAULT_DELOAD_WEEKS)) {
    return { kind: 'due', reason: `Seit ${weeks} Wochen kein Deload.` };
  }
  if (weeks >= MIN_WEEKS_FOR_DROP) {
    const dropping = exercisesDropping(state, start);
    if (dropping >= MIN_EXERCISES_DROPPING) {
      return { kind: 'due', reason: `Bei ${dropping} Übungen sinkt die Leistung seit 2 Einheiten.` };
    }
  }
  return NONE;
}
