// Training summary shown after saving: sets with e1RM, total volume, PRs and a fun comparison.
// Built from the saved payload and the history BEFORE saving, so records are judged against older trainings.

import type { SavePayload, State } from './api';
import { checkRecord, e1rm, formatNumber } from './training';

export interface SummarySet {
  set: number;
  kg: number;
  reps: number;
  e1rm: number;
  isPr: boolean;
}

export interface SummaryExercise {
  name: string;
  sets: SummarySet[];
}

export interface Summary {
  day: string;
  date: string;                    // yyyy-MM-dd
  deload: boolean;
  volume: number;                  // sum of kg × reps
  prCount: number;                 // exercises with a new record
  exercises: SummaryExercise[];
}

export function buildSummary(payload: SavePayload, before: State | null): Summary {
  let volume = 0;
  let prCount = 0;
  const exercises: SummaryExercise[] = [];
  for (const item of payload.exercises) {
    const exercise = before?.exercises.find((e) => e.id === item.id);
    const history = before?.history[item.id];
    const kg = item.kg ?? 0;
    const sets: SummarySet[] = [];
    item.reps.forEach((reps, index) => {
      if (reps === null) return;
      volume += kg * reps;
      sets.push({ set: index + 1, kg, reps, e1rm: e1rm(kg, reps), isPr: false });
    });
    if (!sets.length) continue;
    // the record is the best set of the exercise if it beats all earlier trainings (same rule as in the card)
    if (exercise) {
      const best = [...sets].sort((a, b) => b.reps - a.reps)[0];
      if (checkRecord(exercise, history, kg, best.reps, payload.deload).isRecord) {
        best.isPr = true;
        prCount++;
      }
    }
    exercises.push({ name: exercise?.name ?? item.id, sets });
  }
  return { day: payload.day, date: payload.date, deload: payload.deload, volume, prCount, exercises };
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
