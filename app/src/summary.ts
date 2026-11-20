// Training summary shown after saving: sets with e1RM, total volume, PRs and a fun comparison.
// Built from the saved payload and the history BEFORE saving, so records are judged against older trainings.

import type { SavePayload, State, TrainingDetail } from './api';
import { latestBodyWeight } from './body';
import { checkRecord, checkTestRecord, e1rm, formatNumber } from './training';

export interface SummarySet {
  set: number;
  kg: number;
  reps: number;
  e1rm: number;                    // for a 1RM test the lifted weight
  isPr: boolean;
  test?: boolean;
}

export interface SummaryExercise {
  name: string;
  sets: SummarySet[];
  limited?: string;                // marked "Eingeschränkt": the reason, '' without one
  drops?: { kg: number; reps: number }[];   // drop sets: only volume, never a record
}

export interface Summary {
  day: string;
  date: string;                    // yyyy-MM-dd
  deload: boolean;
  volume: number;                  // sum of kg × reps
  prCount: number;                 // exercises with a new record
  exercises: SummaryExercise[];
  note?: string;
}

export function buildSummary(payload: SavePayload, before: State | null): Summary {
  let volume = 0;
  let prCount = 0;
  const exercises: SummaryExercise[] = [];
  const bodyWeight = before ? latestBodyWeight(before.body) : null;
  for (const item of payload.exercises) {
    const exercise = before?.exercises.find((e) => e.id === item.id);
    const history = before?.history[item.id];
    if (item.test) {                     // 1RM test: no volume, its own record rule
      const kg = item.sets[0]?.kg ?? 0;
      const isPr = checkTestRecord(history, kg).isRecord;
      if (isPr) prCount++;
      exercises.push({ name: exercise?.name ?? item.id, sets: [{ set: 1, kg, reps: 1, e1rm: kg, isPr, test: true }] });
      continue;
    }
    // added weight (pull-ups): the 1RM includes the body weight, like the record check
    const addedBody = exercise?.weightType === 'Zusatzgewicht' && bodyWeight ? bodyWeight : 0;
    const sets: SummarySet[] = item.sets.map((set, index) => {
      volume += set.kg * set.reps;
      return { set: index + 1, kg: set.kg, reps: set.reps, e1rm: e1rm(set.kg + addedBody, set.reps), isPr: false };
    });
    if (!sets.length) continue;
    const drops = item.drops ?? [];
    for (const drop of drops) volume += drop.kg * drop.reps;
    // the record is the heaviest set with the minimum reps if its weight beats all earlier trainings
    // (same rule as in the card); an exercise marked "Eingeschränkt" is never a record
    if (exercise && item.limited == null) {
      const best = [...sets].filter((s) => s.reps >= exercise.repsMin).sort((a, b) => b.kg - a.kg || b.reps - a.reps)[0];
      if (best && checkRecord(exercise, history, best.kg, best.reps, payload.deload).isRecord) {
        best.isPr = true;
        prCount++;
      }
    }
    exercises.push({ name: exercise?.name ?? item.id, sets, limited: item.limited ?? undefined, ...(drops.length ? { drops } : {}) });
  }
  return { day: payload.day, date: payload.date, deload: payload.deload, volume, prCount, exercises, note: payload.note };
}

/** Summary of a training from the history; the web API marks the records (API 1.6.0+). */
export function summaryFromDetail(detail: TrainingDetail): Summary {
  let volume = 0;
  let prCount = 0;
  const exercises = detail.exercises.map((exercise) => {
    const sets = exercise.sets.map((set) => {
      if (!set.test) volume += set.kg * set.reps;
      if (set.isPr) prCount++;
      return { set: set.set, kg: set.kg, reps: set.reps, e1rm: set.e1rm, isPr: set.isPr, test: set.test };
    });
    const drops = (exercise.drops ?? []).map((d) => ({ kg: d.kg, reps: d.reps }));
    for (const drop of drops) volume += drop.kg * drop.reps;
    return { name: exercise.name, sets, limited: exercise.limited, ...(drops.length ? { drops } : {}) };
  });
  return { day: detail.day, date: detail.date, deload: detail.deload, volume, prCount, exercises, note: detail.note };
}

// Absurd units with rough weights in kg; the text uses the dative plural ("entspricht 46 Tigern").
export const FUN_UNITS: { kg: number; dative: string; emoji: string }[] = [
  { kg: 220, dative: 'Tigern', emoji: '🐯' },
  { kg: 0.002, dative: 'Gummibärchen', emoji: '🐻' },
  { kg: 0.08, dative: 'Brezn', emoji: '🥨' },
  { kg: 0.07, dative: 'Weißwürsten', emoji: '🌭' },
  { kg: 2.3, dative: 'vollen Maßkrügen', emoji: '🍺' },
  { kg: 17, dative: 'vollen Bierkästen', emoji: '🍻' },
  { kg: 70, dative: 'Waschmaschinen', emoji: '🫧' },
  { kg: 65, dative: 'Kühlschränken', emoji: '🧊' },
  { kg: 30, dative: 'Kaiserpinguinen', emoji: '🐧' },
  { kg: 5, dative: 'Faultieren', emoji: '🦥' },
  { kg: 1.5, dative: 'Gartenzwergen', emoji: '🍄' },
  { kg: 650, dative: 'Kühen', emoji: '🐄' },
  { kg: 250, dative: 'Klavieren', emoji: '🎹' },
  { kg: 450, dative: 'Eisbären', emoji: '🐻‍❄️' },
  { kg: 2, dative: 'Hühnern', emoji: '🐔' },
  { kg: 2.5, dative: 'Schwarzwälder Kirschtorten', emoji: '🎂' },
  { kg: 160, dative: 'Gorillas', emoji: '🦍' },
  { kg: 1500, dative: 'Nilpferden', emoji: '🦛' },
  { kg: 150000, dative: 'Blauwalen', emoji: '🐋' },
  { kg: 7, dative: 'Bowlingkugeln', emoji: '🎳' },
  { kg: 150, dative: 'Sumo-Ringern', emoji: '🤼' },
  { kg: 100, dative: 'Elefantenbabys', emoji: '🐘' },
  { kg: 900, dative: 'Kleinwagen', emoji: '🚗' },
  { kg: 0.1, dative: 'Zauberwürfeln', emoji: '🧩' },
  { kg: 6000, dative: 'ausgewachsenen Elefanten', emoji: '🐘' },
];

/** "Das bewegte Gewicht entspricht 46 Tigern." – a random unit that gives a count of at least 2. */
export function funComparison(volume: number, random = Math.random): string {
  if (!(volume > 0)) return 'Heute wurde nur Luft bewegt. Auch Luft hat Gefühle. 🌬️';
  const fitting = FUN_UNITS.filter((unit) => volume / unit.kg >= 2);
  const unit = fitting[Math.floor(random() * fitting.length)] ?? FUN_UNITS[1];
  const count = volume / unit.kg;
  const text = count >= 10
    ? Math.round(count).toLocaleString('de-DE')
    : formatNumber(Math.round(count * 10) / 10);
  return `Das bewegte Gewicht entspricht ${text} ${unit.dative}. ${unit.emoji}`;
}
