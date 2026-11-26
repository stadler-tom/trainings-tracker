// Further evaluations of the log: rep records, relative strength, fatigue within a session,
// progress rate and plausibility check. Pure functions, unit tested in insights.test.ts.
// Rep records are information only: they are no records in the sense of the app (no picture, no record count).

import type { BodyEntry } from '../api';
import { addDays } from '../format';
import { e1rm } from '../training';
import { bodyWeightOn, type ExerciseStats, type Session } from './analysis';

const DAY_MS = 86_400_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------- rep records ----------

export interface RepRecord {
  reps: number;
  kg: number;
  date: string;
  beaten: boolean;                 // a heavier or equal weight was moved for more reps: no longer meaningful
}

/** Heaviest weight per rep count over all normal sets (no drops, no "Eingeschränkt", no 1RM tests). */
export function repRecords(stats: ExerciseStats): RepRecord[] {
  const best = new Map<number, { kg: number; date: string }>();
  for (const s of stats.sessions) {
    if (s.limited !== null) continue;
    s.reps.forEach((reps, i) => {
      if (reps <= 0) return;
      const kg = s.kgs[i];
      const known = best.get(reps);
      if (!known || kg > known.kg + 1e-9) best.set(reps, { kg, date: s.date });
    });
  }
  const list = [...best.entries()].map(([reps, r]) => ({ reps, ...r })).sort((a, b) => a.reps - b.reps);
  return list.map((r) => ({ ...r, beaten: list.some((o) => o.reps > r.reps && o.kg >= r.kg - 1e-9) }));
}

// ---------- relative strength ----------

const WEIGHING_MAX_AGE = 14;       // days: older weighings are not used for a ratio

export interface RelativePoint {
  date: string;
  ratio: number;                   // e1RM per kg body weight
  bodyWeight: number;
}

/** e1RM ÷ body weight per regular session; only with a weighing at most 14 days before (or the first one after). */
export function relativeStrength(stats: ExerciseStats, body: BodyEntry[]): RelativePoint[] {
  const weighings = body.filter((b) => b.weight !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!weighings.length) return [];
  const result: RelativePoint[] = [];
  for (const s of stats.regular) {
    const before = [...weighings].reverse().find((b) => b.date <= s.date);
    const near = before && before.date >= addDays(s.date, -WEIGHING_MAX_AGE) ? before
      : weighings.find((b) => b.date > s.date && b.date <= addDays(s.date, WEIGHING_MAX_AGE));
    if (!near) continue;
    result.push({ date: s.date, ratio: s.e1rm / (near.weight as number), bodyWeight: near.weight as number });
  }
  return result;
}

export interface RelativeChange {
  stats: ExerciseStats;
  first: RelativePoint;
  last: RelativePoint;
  change: number;                  // percent
}

export const RELATIVE_DAYS = 42;

/** Relative strength of the planned basic exercises: first against last ratio of the last 6 weeks. */
export function relativeChanges(planned: ExerciseStats[], body: BodyEntry[], today: string): RelativeChange[] {
  const from = addDays(today, -(RELATIVE_DAYS - 1));
  return planned
    .filter((s) => s.exercise.type === 'Grundübung')
    .map((stats) => {
      const points = relativeStrength(stats, body).filter((p) => p.date >= from && p.date <= today);
      if (points.length < 2) return null;
      const first = points[0];
      const last = points[points.length - 1];
      return { stats, first, last, change: ((last.ratio - first.ratio) / first.ratio) * 100 };
    })
    .filter((c): c is RelativeChange => c !== null)
    .sort((a, b) => b.change - a.change);
}

// ---------- fatigue within a session ----------

/**
 * Drop from the best to the weakest set of a session in percent of the reps, e.g. 15 / 11 / 13 = −27 %.
 * With different weights per set, every set is first converted to reps at the heaviest weight (Epley),
 * so a lighter set with the same reps counts as weaker. Null with fewer than 2 sets. Drop sets do not count.
 */
export function dropOff(session: Session, stats: ExerciseStats, body: BodyEntry[]): number | null {
  if (session.reps.length < 2) return null;
  const bw = stats.exercise.weightType === 'Zusatzgewicht' ? bodyWeightOn(body, session.date) ?? 0 : 0;
  const loads = session.kgs.map((kg) => kg + bw);
  const top = Math.max(...loads);
  const reps = loads.every((l) => Math.abs(l - top) < 1e-9) || top <= 0
    ? session.reps
    : session.reps.map((r, i) => 30 * (e1rm(loads[i], r) / top - 1));
  const best = Math.max(...reps);
  if (best <= 0) return null;
  return ((best - Math.max(0, Math.min(...reps))) / best) * 100;
}

export const FATIGUE_DAYS = 21;
export const FATIGUE_HIGH = 25;    // percent: clearly more than a normal decline over the sets

export interface FatigueEntry {
  stats: ExerciseStats;
  recent: number;                  // mean drop of the last 3 weeks
  earlier: number | null;          // mean drop of the 3 weeks before
}

export interface Fatigue {
  median: number | null;           // over the exercises, last 3 weeks
  medianEarlier: number | null;    // the same exercises, the 3 weeks before
  high: FatigueEntry[];            // exercises with a mean drop of 25 % or more, highest first
}

export function fatigue(planned: ExerciseStats[], body: BodyEntry[], today: string): Fatigue {
  const recentFrom = addDays(today, -(FATIGUE_DAYS - 1));
  const earlierFrom = addDays(recentFrom, -FATIGUE_DAYS);
  const mean = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const entries: FatigueEntry[] = [];
  for (const stats of planned) {
    const drops = (from: string, to: string) => stats.regular.filter((s) => s.date >= from && s.date < to)
      .map((s) => dropOff(s, stats, body)).filter((d): d is number => d !== null);
    const recent = mean(drops(recentFrom, addDays(today, 1)));
    if (recent === null) continue;
    entries.push({ stats, recent, earlier: mean(drops(earlierFrom, recentFrom)) });
  }
  const both = entries.filter((e) => e.earlier !== null);
  return {
    median: entries.length ? median(entries.map((e) => e.recent)) : null,
    medianEarlier: both.length ? median(both.map((e) => e.earlier as number)) : null,
    high: entries.filter((e) => e.recent >= FATIGUE_HIGH).sort((a, b) => b.recent - a.recent),
  };
}

// ---------- progress rate ----------

export const RATE_DAYS = 42;
const RATE_MIN_SESSIONS = 3;

export interface ProgressRate {
  stats: ExerciseStats;
  perWeek: number;                 // percent of the mean e1RM per week
  sessions: number;
}

/** e1RM trend per planned exercise over the last 6 weeks (least squares), in percent per week, fastest first. */
export function progressRates(planned: ExerciseStats[], today: string): ProgressRate[] {
  const from = addDays(today, -(RATE_DAYS - 1));
  const rates: ProgressRate[] = [];
  for (const stats of planned) {
    const points = stats.regular.filter((s) => s.date >= from && s.date <= today)
      .map((s) => ({ x: (Date.parse(s.date) - Date.parse(from)) / DAY_MS, y: s.e1rm }));
    if (points.length < RATE_MIN_SESSIONS) continue;
    const mx = points.reduce((a, p) => a + p.x, 0) / points.length;
    const my = points.reduce((a, p) => a + p.y, 0) / points.length;
    const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    if (sxx === 0 || my <= 0) continue;
    const slope = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
    rates.push({ stats, perWeek: ((slope * 7) / my) * 100, sessions: points.length });
  }
  return rates.sort((a, b) => b.perWeek - a.perWeek);
}

// ---------- plausibility ----------

export const JUMP_PERCENT = 30;
const MAX_REPS = 50;
const SET_OUTLIER = 2;             // a set this many times heavier or lighter than the others of the session

export interface Suspicious {
  stats: ExerciseStats;
  date: string;
  text: string;
}

/**
 * Entries worth a look in the sheet: e1RM jump of 30 % or more against the previous normal session,
 * a set with 0 or more than 50 reps, or a set weight twice / half of the other sets (typo like 100 instead of 10).
 * Sessions marked "Eingeschränkt" and deload sessions are skipped: they are already explained. Newest first.
 */
export function suspicious(all: ExerciseStats[]): Suspicious[] {
  const found: Suspicious[] = [];
  for (const stats of all) {
    let previous: Session | null = null;
    for (const s of stats.sessions) {
      if (s.limited !== null || s.deload) continue;
      const reasons: string[] = [];
      if (s.reps.some((r) => r <= 0 || r > MAX_REPS)) reasons.push(`Satz mit ${s.reps.find((r) => r <= 0 || r > MAX_REPS)} Wdh`);
      if (s.kgs.length >= 3) {
        const typical = median(s.kgs);
        const odd = s.kgs.find((kg) => typical > 0 && (kg >= typical * SET_OUTLIER || kg <= typical / SET_OUTLIER));
        if (odd !== undefined) reasons.push(`ein Satz mit ${odd.toLocaleString('de-DE')} kg, die anderen um ${typical.toLocaleString('de-DE')} kg`);
      }
      if (previous && previous.e1rm > 0) {
        const change = ((s.e1rm - previous.e1rm) / previous.e1rm) * 100;
        if (Math.abs(change) >= JUMP_PERCENT) {
          reasons.push(`e1RM ${change > 0 ? '+' : '−'}${Math.round(Math.abs(change))} % gegenüber ${previous.date.split('-').reverse().join('.')}`);
        }
      }
      if (reasons.length) found.push({ stats, date: s.date, text: reasons.join(', ') });
      previous = s;
    }
  }
  return found.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.stats.exercise.name.localeCompare(b.stats.exercise.name, 'de')));
}
