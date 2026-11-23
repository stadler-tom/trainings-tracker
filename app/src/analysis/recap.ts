// Calculations of the page "Recap": one statement per tile.
// Pure functions on the analysis data and the per-exercise statistics; unit tested in recap.test.ts.
// Kept simple on purpose: with 1–2 sessions per exercise and week, a trend line, a median and
// fixed thresholds are more honest than significance tests.

import { weekStart, weightCheck, waistTrend } from '../body';
import { addDays, formatIsoDate } from '../format';
import { trainingCount, weeklySets, type AnalysisData, type ExerciseStats, type Session } from './analysis';
import { formatNumber } from '../training';

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

// ---------- exercises in the current plan ----------

/** Active, non-warm-up exercises that are in at least one day sheet. */
export function plannedStats(data: AnalysisData, stats: Map<string, ExerciseStats>): ExerciseStats[] {
  const planned = new Set(data.days.flatMap((d) => d.exerciseIds));
  return [...stats.values()].filter((s) => s.exercise.active && s.exercise.type !== 'Aufwärmen' && planned.has(s.exercise.id));
}

// ---------- body weight trend (least squares) ----------

export const TREND_DAYS = 28;
const TREND_MIN_WEIGHINGS = 4;
const TREND_MIN_SPAN_DAYS = 10;

/** Slope of a straight line through the weighings of the last 28 days, in kg per week; null without enough data. */
export function weightSlope(data: AnalysisData, today: string): number | null {
  const from = addDays(today, -(TREND_DAYS - 1));
  const points = data.body
    .filter((b) => b.weight !== null && b.date >= from && b.date <= today)
    .map((b) => ({ x: days(from, b.date), y: b.weight as number }));
  if (points.length < TREND_MIN_WEIGHINGS) return null;
  const xs = points.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < TREND_MIN_SPAN_DAYS) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / points.length;
  const my = points.reduce((a, p) => a + p.y, 0) / points.length;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  return (sxy / sxx) * 7;
}

// ---------- strength index ----------

export const STRENGTH_WINDOW_DAYS = 21;
const STRENGTH_MIN_EXERCISES = 3;

export interface StrengthIndex {
  median: number;                  // percent
  count: number;                   // exercises with sessions in both windows
}

/**
 * For every planned exercise: best e1RM of its regular sessions (no deload, no "Eingeschränkt",
 * no 1RM test) in the last 3 weeks against the 3 weeks before, in percent. The median of these
 * changes, so a single outlier cannot tip the picture. Null with fewer than 3 exercises.
 */
export function strengthIndex(planned: ExerciseStats[], today: string): StrengthIndex | null {
  const recentFrom = addDays(today, -(STRENGTH_WINDOW_DAYS - 1));
  const earlierFrom = addDays(recentFrom, -STRENGTH_WINDOW_DAYS);
  const best = (list: Session[]) => (list.length ? Math.max(...list.map((s) => s.e1rm)) : null);
  const changes: number[] = [];
  for (const s of planned) {
    const recent = best(s.regular.filter((x) => x.date >= recentFrom && x.date <= today));
    const earlier = best(s.regular.filter((x) => x.date >= earlierFrom && x.date < recentFrom));
    if (recent !== null && earlier !== null && earlier > 0) changes.push(((recent - earlier) / earlier) * 100);
  }
  if (changes.length < STRENGTH_MIN_EXERCISES) return null;
  const sorted = [...changes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { median, count: changes.length };
}

// ---------- re-entry after a break ----------

const BREAK_DAYS = 28;
const REENTRY_DAYS = 42;

/** First training after a break of 4+ weeks, if that was less than 6 weeks ago; else null. */
export function reentryDate(data: AnalysisData, today: string): string | null {
  const dates = [...new Set(data.log.map((r) => r[0]))].filter((d) => d <= today).sort();
  for (let i = dates.length - 1; i > 0; i--) {
    if (dates[i] < addDays(today, -REENTRY_DAYS)) return null;
    if (days(dates[i - 1], dates[i]) >= BREAK_DAYS) return dates[i];
  }
  return null;
}

// ---------- tile 1: recomposition traffic light ----------

const WEIGHT_TOLERANCE = 0.25;     // kg per week, like the weekly check (0.5 kg per two weeks)
const STRENGTH_UP = 1;             // percent
const STRENGTH_DOWN = -2;          // percent

export type Light = 'green' | 'yellow' | 'red' | 'none';

export interface Recomposition {
  light: Light;
  verdict: string;
  advice: string;
  slope: number | null;            // kg per week
  target: number;                  // kg per week
  strength: StrengthIndex | null;
  reentry: string | null;
}

export function recomposition(data: AnalysisData, stats: Map<string, ExerciseStats>, today: string): Recomposition {
  const target = data.settings.weightTarget;
  const slope = weightSlope(data, today);
  const strength = strengthIndex(plannedStats(data, stats), today);
  const reentry = reentryDate(data, today);
  const base = { slope, target, strength, reentry };
  if (slope === null || strength === null) {
    return { ...base, light: 'none', verdict: 'Noch zu wenig Daten.',
      advice: 'Nötig: mindestens 4 Wiegungen über 10+ Tage in den letzten 4 Wochen und 3 Übungen mit Einheiten in beiden 3-Wochen-Fenstern.' };
  }
  const diff = slope - target;
  const weight = Math.abs(diff) <= WEIGHT_TOLERANCE ? 'onTrack'
    : (target < 0 ? diff > 0 : target > 0 ? diff < 0 : false) ? 'behind' : 'ahead';
  const force = strength.median >= STRENGTH_UP ? 'up' : strength.median <= STRENGTH_DOWN ? 'down' : 'flat';
  const losing = target < 0;
  if (force === 'down' && weight !== 'behind') {
    return { ...base, light: 'red', verdict: losing ? 'Kraft sinkt im Defizit.' : 'Kraft sinkt.',
      advice: losing
        ? 'Das Defizit ist vermutlich zu groß. Bleibt das 2–3 Wochen so: ca. 200 kcal mehr pro Tag, zuerst Kohlenhydrate. Protein bleibt gleich.'
        : 'Erholung prüfen: Schlaf, Stress, Deload fällig?' };
  }
  if (force === 'down') {
    return { ...base, light: 'red', verdict: 'Kraft sinkt, obwohl das Gewicht nicht wie geplant fällt.',
      advice: 'Eher Erholung prüfen (Schlaf, Stress, Deload) als die Kalorien.' };
  }
  const forceText = force === 'up' ? 'Kraft steigt' : 'Kraft hält';
  if (weight === 'onTrack') {
    return { ...base, light: 'green', verdict: losing ? `Rekomposition läuft: Gewicht im Plan, ${forceText}.` : `Gewicht im Plan, ${forceText}.`,
      advice: 'Nichts ändern.' };
  }
  if (weight === 'behind') {
    return { ...base, light: 'yellow', verdict: `${forceText}, aber das Gewicht bewegt sich langsamer als geplant.`,
      advice: losing
        ? 'Bauchumfang prüfen: Sinkt er, verlierst du trotzdem Fett. Bleibt der Trend 2–3 Wochen: ca. 200 kcal weniger, zuerst Kohlenhydrate.'
        : 'Bleibt der Trend 2–3 Wochen: ca. 200 kcal mehr pro Tag.' };
  }
  return { ...base, light: 'yellow', verdict: `${forceText}, das Gewicht bewegt sich schneller als geplant.`,
    advice: losing
      ? 'Noch hält die Kraft. Zu schnelles Abnehmen kostet auf Dauer Muskeln: beobachten, bei sinkender Kraft ca. 200 kcal mehr.'
      : 'Zu schnelles Zunehmen bringt vor allem Fett: ca. 200 kcal weniger pro Tag.' };
}

// ---------- tile 2: weight X vs X−2 and waist ----------

export function bodyComparison(data: AnalysisData, today: string) {
  return { weight: weightCheck(data.body, data.settings.weightTarget, today), waist: waistTrend(data.body.filter((b) => b.date <= today)) };
}

// ---------- tile 3: stalled exercises ----------

export const STALL_MIN_SESSIONS = 3;

export interface Stall {
  stats: ExerciseStats;
  sessions: number;                // regular sessions without progress since `since`
  since: string;                   // date of the last session with progress
}

/**
 * A session makes progress when its e1RM beats the last progress session or its heaviest set is
 * heavier (a weight increase counts as progress even with fewer reps). Stalled: the last 3+
 * regular sessions made no progress. Small ups and downs below the reference do not reset the count.
 */
export function stallOf(stats: ExerciseStats): Stall | null {
  const sessions = stats.regular;
  if (sessions.length <= STALL_MIN_SESSIONS) return null;
  let ref = sessions[0];
  let count = 0;
  for (const s of sessions.slice(1)) {
    if (s.e1rm > ref.e1rm + 1e-9 || Math.max(...s.kgs) > Math.max(...ref.kgs) + 1e-9) { ref = s; count = 0; }
    else count++;
  }
  return count >= STALL_MIN_SESSIONS ? { stats, sessions: count, since: ref.date } : null;
}

export function stalls(planned: ExerciseStats[]): Stall[] {
  return planned.map(stallOf).filter((s): s is Stall => s !== null)
    .sort((a, b) => b.sessions - a.sessions || a.stats.exercise.name.localeCompare(b.stats.exercise.name, 'de'));
}

// ---------- tile 4: weekly sets below plan ----------

export interface SetsShortfall {
  group: string;
  planned: number;                 // halved in a deload week
  done: number;
}

export interface WeekSets {
  week: string;                    // Monday of the last complete week
  deload: boolean;
  short: SetsShortfall[];
  groups: number;                  // muscle groups with a planned value
  hasPlan: boolean;                // false with an older script without sets per slot
}

/** Planned working sets per muscle group from the day sheets (each day once a week). */
export function plannedSets(data: AnalysisData): Map<string, number> {
  const groupOf = new Map(data.exercises.filter((e) => e.type !== 'Aufwärmen').map((e) => [e.id, e.muscleGroup]));
  const result = new Map<string, number>();
  for (const slot of data.days.flatMap((d) => d.slots ?? [])) {
    const group = groupOf.get(slot.id);
    if (group) result.set(group, (result.get(group) ?? 0) + slot.sets);
  }
  return result;
}

/** Last complete week (Monday to Sunday before the running week) against the plan. */
export function weekSets(data: AnalysisData, today: string): WeekSets {
  const week = addDays(weekStart(today), -7);
  const plan = plannedSets(data);
  const done = weeklySets(data, [week]);
  const deload = [...done.values()].some((v) => v[0].deload);
  const short: SetsShortfall[] = [];
  for (const [group, sets] of plan) {
    const planned = deload ? Math.ceil(sets / 2) : sets;
    const actual = done.get(group)?.[0].sets ?? 0;
    if (actual < planned) short.push({ group, planned, done: actual });
  }
  const order = data.muscleGroups.map((g) => g.name);
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
  short.sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group, 'de'));
  return { week, deload, short, groups: plan.size, hasPlan: data.days.some((d) => d.slots?.length) };
}

// ---------- tile 5: "Eingeschränkt" ----------

export const LIMITED_WEEKS = 6;

export interface LimitedExercise {
  name: string;
  count: number;                   // limited sessions in the 6 weeks
  lastDate: string;
  reason: string;                  // newest reason, '' without one
}

export interface Limited {
  weeks: { week: string; count: number }[];   // oldest first, the running week last
  exercises: LimitedExercise[];
  trend: 'none' | 'better' | 'same' | 'worse';
}

/** Limited exercise sessions per week (last 6 weeks incl. the running one) and per exercise. */
export function limitedTracking(stats: Map<string, ExerciseStats>, today: string): Limited {
  const current = weekStart(today);
  const weeks = Array.from({ length: LIMITED_WEEKS }, (_, i) => ({ week: addDays(current, -7 * (LIMITED_WEEKS - 1 - i)), count: 0 }));
  const from = weeks[0].week;
  const exercises: LimitedExercise[] = [];
  for (const s of stats.values()) {
    const limited = s.sessions.filter((x) => x.limited !== null && x.date >= from && x.date <= today);
    if (!limited.length) continue;
    for (const x of limited) weeks.find((w) => w.week === weekStart(x.date))!.count++;
    const last = limited[limited.length - 1];
    exercises.push({ name: s.exercise.name, count: limited.length, lastDate: last.date, reason: last.limited ?? '' });
  }
  exercises.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : a.name.localeCompare(b.name, 'de')));
  const half = LIMITED_WEEKS / 2;
  const earlier = weeks.slice(0, half).reduce((n, w) => n + w.count, 0);
  const recent = weeks.slice(half).reduce((n, w) => n + w.count, 0);
  const trend = earlier + recent === 0 ? 'none' : recent < earlier ? 'better' : recent > earlier ? 'worse' : 'same';
  return { weeks, exercises, trend };
}

// ---------- tile 0: general summary ----------

export interface OverallStrength {
  median: number;                  // percent
  since: string;                   // earliest first session of the exercises counted
  count: number;
}

/**
 * How much stronger overall: per planned exercise the newest regular e1RM against its first
 * regular one, in percent; the median over all exercises with at least 2 regular sessions.
 */
export function overallStrength(planned: ExerciseStats[]): OverallStrength | null {
  const changes: number[] = [];
  let since = '';
  for (const s of planned) {
    if (s.regular.length < 2) continue;
    const first = s.regular[0];
    const last = s.regular[s.regular.length - 1];
    changes.push(((last.e1rm - first.e1rm) / first.e1rm) * 100);
    if (!since || first.date < since) since = first.date;
  }
  if (!changes.length) return null;
  const sorted = [...changes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, since, count: changes.length };
}

export type Tone = 'good' | 'bad' | 'neutral';

export interface SummaryLine {
  text: string;
  tone: Tone;                      // marker: positive, negative or plain information
  items?: string[];                // sub-list, e.g. the muscle groups below their weekly plan
}

export interface Summary {
  lines: SummaryLine[];            // one short statement per topic
  focus: string;                   // the one thing to look at first
}

/** A few statements from all tiles plus trainings and overall strength, and one focus for the coming week. */
export function summary(data: AnalysisData, stats: Map<string, ExerciseStats>, today: string): Summary {
  const recomp = recomposition(data, stats, today);
  const body = bodyComparison(data, today);
  const planned = plannedStats(data, stats);
  const stalled = stalls(planned);
  const sets = weekSets(data, today);
  const limited = limitedTracking(stats, today);
  const kg = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatNumber(Math.abs(Math.round(v * 10) / 10))}`;
  const lines: SummaryLine[] = [];

  const trainings = trainingCount(data.log, sets.week, addDays(sets.week, 6));
  const planDays = data.days.length;
  lines.push({ text: `Letzte Woche: ${trainings} von ${planDays} Trainingstagen${sets.deload ? ' (Deload-Woche)' : ''}.`,
    tone: trainings >= planDays || sets.deload ? 'good' : 'bad' });

  const overall = overallStrength(planned);
  if (overall) {
    const recent = recomp.strength ? `, in den letzten 3 Wochen ${kg(recomp.strength.median)} %` : '';
    const value = recomp.strength ? recomp.strength.median : overall.median;
    lines.push({ text: `Kraft: insgesamt ${kg(overall.median)} % seit ${formatIsoDate(overall.since)}${recent}.`,
      tone: value >= STRENGTH_UP ? 'good' : value <= STRENGTH_DOWN ? 'bad' : 'neutral' });
  }

  if (body.weight) {
    lines.push({ text: `Gewicht: ${kg(body.weight.change)} kg in 2 Wochen (geplant ${kg(body.weight.expected)} kg). ${body.weight.text}`,
      tone: body.weight.status === 'onTrack' ? 'good' : 'bad' });
  } else if (recomp.slope !== null) {
    lines.push({ text: `Gewicht: Trend ${kg(recomp.slope)} kg pro Woche.`, tone: 'neutral' });
  }
  if (body.waist?.change != null) {
    const change = body.waist.change;
    lines.push({ text: `Bauchumfang: ${kg(change)} cm in 3+ Wochen${change <= -1 ? ', das spricht für Fettverlust.' : '.'}`,
      tone: change < 0 ? 'good' : change > 0 ? 'bad' : 'neutral' });
  }

  if (stalled.length) {
    const names = stalled.slice(0, 3).map((s) => s.stats.exercise.name).join(', ');
    lines.push({ text: `Stillstand bei ${stalled.length} ${stalled.length === 1 ? 'Übung' : 'Übungen'}: ${names}${stalled.length > 3 ? ' …' : ''}.`, tone: 'bad' });
  } else if (planned.length) {
    lines.push({ text: 'Keine Übung steht still.', tone: 'good' });
  }

  if (sets.hasPlan) {
    lines.push(sets.short.length
      ? { text: 'Wochensoll nicht erreicht:', tone: 'bad', items: sets.short.map((s) => `${s.group}: ${s.done} von ${s.planned} Sätzen`) }
      : { text: 'Alle Muskelgruppen haben ihr Wochensoll erreicht.', tone: 'good' });
  }

  // one focus, most important first
  let focus = 'Weiter so: nichts ändern, nächste Woche wieder reinschauen.';
  if (recomp.light === 'red') focus = `${recomp.verdict} ${recomp.advice}`;
  else if (trainings < planDays && !sets.deload) focus = 'Trainingstage durchziehen: Verpasste Einheiten bremsen mehr als jedes falsche Gewicht.';
  else if (sets.short.length) focus = `Wochensätze auffüllen, zuerst ${sets.short[0].group}.`;
  else if (limited.trend === 'worse') focus = 'Eingeschränkte Übungen nehmen zu: Ursache klären, notfalls ärztlich abklären lassen.';
  else if (recomp.light === 'yellow') focus = `${recomp.verdict} ${recomp.advice}`;
  else if (stalled.length) focus = `Stillstand angehen, zuerst ${stalled[0].stats.exercise.name}.`;
  else if (recomp.light === 'none') focus = 'Für eine Bewertung regelmäßig wiegen (mind. 3× pro Woche) und trainieren.';
  return { lines, focus };
}
