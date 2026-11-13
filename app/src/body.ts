// Body weight evaluation (project rule of the nutrition plan):
// - single days are not judged, only weekly averages (Monday to Sunday, at least 3 weighings),
// - week X is compared with week X−2, against twice the weekly target from sheet "Einstellungen",
// - advice to change calories only when two comparisons in a row are off in the same direction,
//   carbohydrates first, protein stays.
// Pure functions, unit tested in body.test.ts.

import type { BodyEntry } from './api';
import { formatNumber } from './training';

export const DEFAULT_WEIGHT_TARGET = -0.5;       // kg per week
const MIN_WEIGHINGS_PER_WEEK = 3;
const TOLERANCE_KG = 0.5;                        // per two weeks
const MOVING_AVERAGE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WeekAverage {
  start: string;                                 // Monday, yyyy-MM-dd
  average: number;
  count: number;
}

export type WeightStatus = 'onTrack' | 'tooSlow' | 'tooFast';

export interface WeightCheck {
  week: WeekAverage;                             // the newest week with enough weighings
  compare: WeekAverage;                          // two weeks before it
  change: number;                                // kg, week minus compare
  expected: number;                              // kg, 2 × weekly target
  status: WeightStatus;
  text: string;                                  // German, e.g. "Du nimmst langsamer ab als geplant."
  advice: string;                                // German; empty if nothing to change
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week of a date (yyyy-MM-dd). */
export function weekStart(iso: string): string {
  const weekday = (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;   // Monday = 0
  return addDays(iso, -weekday);
}

/** Newest weighing on or before today. */
export function latestBodyWeight(body: BodyEntry[] | undefined, today?: string): number | null {
  const weighings = (body ?? []).filter((b) => b.weight !== null && (!today || b.date <= today));
  return weighings.length ? weighings[weighings.length - 1].weight : null;
}

/** Weekly averages of all weeks with at least one weighing, oldest first. */
export function weekAverages(body: BodyEntry[]): WeekAverage[] {
  const weeks = new Map<string, number[]>();
  for (const entry of body) {
    if (entry.weight === null) continue;
    const start = weekStart(entry.date);
    weeks.set(start, [...(weeks.get(start) ?? []), entry.weight]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([start, values]) => ({
      start,
      average: Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100,
      count: values.length,
    }));
}

/** 7-day moving average at every weighing, for the chart. */
export function movingAverage(body: BodyEntry[]): { date: string; value: number }[] {
  const weighings = body.filter((b) => b.weight !== null) as { date: string; weight: number }[];
  return weighings.map((entry) => {
    const from = addDays(entry.date, -(MOVING_AVERAGE_DAYS - 1));
    const window = weighings.filter((w) => w.date >= from && w.date <= entry.date);
    const value = window.reduce((sum, w) => sum + w.weight, 0) / window.length;
    return { date: entry.date, value: Math.round(value * 100) / 100 };
  });
}

function compareWeeks(weeks: WeekAverage[], start: string, target: number) {
  const week = weeks.find((w) => w.start === start && w.count >= MIN_WEIGHINGS_PER_WEEK);
  const compare = weeks.find((w) => w.start === addDays(start, -14) && w.count >= MIN_WEIGHINGS_PER_WEEK);
  if (!week || !compare) return null;
  const change = Math.round((week.average - compare.average) * 100) / 100;
  const expected = Math.round(2 * target * 100) / 100;
  const diff = change - expected;
  let status: WeightStatus = 'onTrack';
  if (Math.abs(diff) > TOLERANCE_KG) {
    // "too slow" = behind the target: losing less than planned, or gaining less than planned
    const behind = target < 0 ? diff > 0 : target > 0 ? diff < 0 : false;
    status = target === 0 ? (diff > 0 ? 'tooFast' : 'tooSlow') : behind ? 'tooSlow' : 'tooFast';
  }
  return { week, compare, change, expected, status, diff };
}

function statusText(status: WeightStatus, target: number, diff: number): string {
  if (status === 'onTrack') return 'Du liegst im Plan.';
  if (target === 0) return diff > 0 ? 'Du nimmst zu, Ziel ist Halten.' : 'Du nimmst ab, Ziel ist Halten.';
  const direction = target < 0 ? 'ab' : 'zu';
  return status === 'tooSlow'
    ? `Du nimmst langsamer ${direction} als geplant.`
    : `Du nimmst schneller ${direction} als geplant.`;
}

/**
 * Weekly comparison and advice. today decides which weeks count: the newest week up to today
 * with enough weighings (usually the running one or the last one).
 */
export function weightCheck(body: BodyEntry[] | undefined, target: number | undefined, today: string): WeightCheck | null {
  const goal = target ?? DEFAULT_WEIGHT_TARGET;
  const weeks = weekAverages((body ?? []).filter((b) => b.date <= today));
  const usable = weeks.filter((w) => w.count >= MIN_WEIGHINGS_PER_WEEK);
  for (let i = usable.length - 1; i >= 0; i--) {
    const now = compareWeeks(weeks, usable[i].start, goal);
    if (!now) continue;
    const before = compareWeeks(weeks, addDays(usable[i].start, -7), goal);
    let advice = '';
    if (now.status !== 'onTrack' && before && before.status === now.status) {
      // above the plan (losing too slowly, gaining too fast, or gaining while holding) → fewer calories
      const fewer = now.diff > 0;
      advice = fewer
        ? 'Seit 2 Wochen über dem Plan: Kalorien um ca. 200 kcal pro Tag senken, zuerst bei den Kohlenhydraten (ca. 50 g). Protein bleibt gleich.'
        : 'Seit 2 Wochen unter dem Plan: Kalorien um ca. 200 kcal pro Tag erhöhen, z. B. 50 g Kohlenhydrate mehr. Protein bleibt gleich.';
    } else if (now.status !== 'onTrack') {
      advice = 'Einzelne Wochen schwanken. Angepasst wird erst, wenn der Trend 2 Wochen in Folge nicht passt.';
    }
    return {
      week: now.week, compare: now.compare, change: now.change, expected: now.expected,
      status: now.status, text: statusText(now.status, goal, now.diff), advice,
    };
  }
  return null;
}

/** Newest waist measurement and its change against the one about 4 weeks earlier. */
export function waistTrend(body: BodyEntry[] | undefined): { latest: number; date: string; change: number | null } | null {
  const measured = (body ?? []).filter((b) => b.waist !== null) as { date: string; waist: number }[];
  if (!measured.length) return null;
  const latest = measured[measured.length - 1];
  const earlier = measured.filter((m) => m.date <= addDays(latest.date, -21));
  const base = earlier.length ? earlier[earlier.length - 1] : null;
  return { latest: latest.waist, date: latest.date, change: base ? Math.round((latest.waist - base.waist) * 10) / 10 : null };
}

/** "−0,4 kg" / "+0,3 kg" with sign. */
export function signedKg(value: number, unit = 'kg'): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${formatNumber(Math.abs(rounded))} ${unit}`;
}
