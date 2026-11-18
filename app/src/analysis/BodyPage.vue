<script setup lang="ts">
// Body weight (7-day average, weekly comparison with two weeks earlier), waist and relative strength.
import { computed, ref } from 'vue';
import { movingAverage, signedKg, waistTrend, weekAverages, weekStart, weightCheck } from '../body';
import { addDays, formatIsoDate, todayIso } from '../format';
import { bodyWeightOn, e1rmAt, oneDecimal, trainingCount, weeksBetween, type AnalysisData, type ExerciseStats } from './analysis';
import LineChart from './LineChart.vue';

const props = defineProps<{ data: AnalysisData; stats: Map<string, ExerciseStats> }>();

const RANGES = [
  { id: '1m', label: '1 Mon.', days: 30 },
  { id: '3m', label: '3 Mon.', days: 91 },
  { id: '6m', label: '6 Mon.', days: 182 },
] as const;
const range = ref<(typeof RANGES)[number]['id']>('3m');
const today = todayIso();
const from = computed(() => addDays(today, -(RANGES.find((r) => r.id === range.value)!.days - 1)));

const body = computed(() => props.data.body);
const shown = computed(() => body.value.filter((b) => b.date >= from.value && b.weight !== null));

// relative strength: an exercise with regular sessions; "Kniebeuge" first if there is one
const strengthOptions = computed(() => [...props.stats.values()]
  .filter((s) => s.regular.length > 0)
  .map((s) => s.exercise)
  .sort((a, b) => a.name.localeCompare(b.name, 'de')));
const strengthId = ref<string | null>(null);
const strength = computed(() => {
  const id = strengthId.value ?? strengthOptions.value.find((e) => /^kniebeuge/i.test(e.name))?.id ?? strengthOptions.value[0]?.id;
  return id ? props.stats.get(id) ?? null : null;
});
const relative = (date: string) => {
  if (!strength.value) return null;
  const value = e1rmAt(strength.value, date);
  const weight = bodyWeightOn(body.value, date);
  return value !== null && weight ? value / weight : null;
};

const tiles = computed(() => {
  const thisWeek = weekAverages(body.value).find((w) => w.start === weekStart(today));
  const check = weightCheck(body.value, props.data.settings.weightTarget, today);
  const waist = waistTrend(body.value);
  const waistFrom = body.value.filter((b) => b.waist !== null && b.date <= from.value).pop()
    ?? body.value.find((b) => b.waist !== null && b.date >= from.value);
  const relNow = relative(today);
  const relStart = relative(from.value);
  return {
    weekAvg: thisWeek ? `${oneDecimal(thisWeek.average)} kg` : '–',
    weekCount: thisWeek ? `${thisWeek.count} ${thisWeek.count === 1 ? 'Messung' : 'Messungen'} diese Woche` : 'diese Woche noch keine Messung',
    trend: check ? signedKg(check.change) : '–',
    trendClass: check ? (check.status === 'onTrack' ? 'a-good' : 'a-bad') : '',
    trendText: check ? `${signedKg(check.change / 2)} pro Woche · ${check.text}` : 'Braucht je Woche mind. 3 Messungen.',
    waist: waist ? `${oneDecimal(waist.latest)} cm` : '–',
    waistText: waist && waistFrom && waistFrom.waist !== null
      ? `${signedKg(waist.latest - waistFrom.waist, 'cm')} im Zeitraum`
      : 'noch kein Bauchumfang',
    relNow: relNow !== null ? `${relNow.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} × KG` : '–',
    relStart: relStart !== null ? `am ${formatIsoDate(from.value)}: ${relStart.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} × KG` : '',
  };
});

const averageLine = computed(() => movingAverage(body.value).filter((p) => p.date >= from.value));

const weeks = computed(() => {
  const averages = new Map(weekAverages(body.value).map((w) => [w.start, w]));
  return weeksBetween(addDays(today, -7 * 7), today).reverse().map((monday, k) => {
    const week = averages.get(monday);
    const before = averages.get(addDays(monday, -14));
    const diff = week && before ? week.average - before.average : null;
    const waist = body.value.filter((b) => b.waist !== null && b.date >= monday && b.date <= addDays(monday, 6)).pop();
    return {
      label: `KW ab ${formatIsoDate(monday).slice(0, 6)}${k === 0 ? ' (läuft)' : ''}`,
      average: week ? `${oneDecimal(week.average)} kg` : '–',
      count: week?.count ?? 0,
      diff: diff === null ? '–' : signedKg(diff),
      diffClass: diff === null ? '' : Math.sign(diff) === Math.sign(props.data.settings.weightTarget) || Math.abs(diff) < 0.05 ? 'a-good' : 'a-bad',
      waist: waist?.waist ? `${oneDecimal(waist.waist)} cm` : '–',
      trainings: trainingCount(props.data.log, monday, addDays(monday, 6)),
    };
  });
});
</script>

<template>
  <div class="a-bar">
    <h1>Körper</h1>
    <div class="a-segments" role="group" aria-label="Zeitraum">
      <button v-for="r in RANGES" :key="r.id" type="button" :aria-pressed="range === r.id" @click="range = r.id">{{ r.label }}</button>
    </div>
  </div>

  <div class="a-tiles">
    <div class="a-tile"><div class="a-label">Wochenschnitt aktuell</div><div class="a-value">{{ tiles.weekAvg }}</div><div class="a-label">{{ tiles.weekCount }}</div></div>
    <div class="a-tile"><div class="a-label">Trend über 2 Wochen</div><div class="a-value" :class="tiles.trendClass">{{ tiles.trend }}</div><div class="a-label">{{ tiles.trendText }}</div></div>
    <div class="a-tile"><div class="a-label">Bauchumfang</div><div class="a-value">{{ tiles.waist }}</div><div class="a-label">{{ tiles.waistText }}</div></div>
    <div class="a-tile">
      <label class="a-label" for="strength">Kraft relativ zum Körpergewicht</label>
      <select id="strength" :value="strength?.exercise.id" style="min-height: 36px; border: 1px solid var(--a-line2); border-radius: 8px; background: var(--a-surface); padding: 0 6px"
        @change="strengthId = ($event.target as HTMLSelectElement).value">
        <option v-for="e in strengthOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
      </select>
      <div class="a-value">{{ tiles.relNow }}</div>
      <div class="a-label">{{ tiles.relStart }}</div>
    </div>
  </div>

  <section class="a-card">
    <div class="a-bar" style="gap: 8px">
      <h2>Körpergewicht</h2>
      <div class="a-legend">
        <span><span class="a-dot" style="width: 8px; height: 8px; background: var(--a-neutral)"></span>Tageswert</span>
        <span><span style="width: 18px; height: 3px; background: var(--a-chart); display: inline-block"></span>7-Tage-Schnitt</span>
      </div>
    </div>
    <LineChart
      :lines="[{ points: averageLine, color: 'var(--a-chart)' }]"
      :marks="shown.map((b) => ({ date: b.date, value: b.weight as number, shape: 'circle', color: 'var(--a-neutral)', size: 3 }))"
      :from="from"
      :to="today"
      :digits="1"
      label="Körpergewicht mit 7-Tage-Schnitt"
    />
  </section>

  <section class="a-card">
    <h2>Wochenübersicht</h2>
    <div class="a-scroll">
      <table class="a-table" style="min-width: 640px">
        <thead><tr><th>Woche</th><th class="num">Ø Gewicht</th><th class="num">Messungen</th><th class="num">vs. 2 Wochen vorher</th><th class="num">Bauch</th><th class="num">Trainings</th></tr></thead>
        <tbody>
          <tr v-for="w in weeks" :key="w.label">
            <td>{{ w.label }}</td>
            <td class="num" style="font-weight: 600">{{ w.average }}</td>
            <td class="num">{{ w.count }}</td>
            <td class="num" :class="w.diffClass">{{ w.diff }}</td>
            <td class="num">{{ w.waist }}</td>
            <td class="num">{{ w.trainings }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="a-note">Bewertet wird der Wochenschnitt im Vergleich zu zwei Wochen vorher, nicht der einzelne Tageswert.</p>
  </section>
</template>
