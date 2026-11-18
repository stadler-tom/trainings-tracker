<script setup lang="ts">
// One exercise in detail: e1RM, record, last session, next training, charts and the last sessions.
import { computed, ref } from 'vue';
import { addDays, formatIsoDate, todayIso } from '../format';
import { formatNumber } from '../training';
import { nextTraining, oneDecimal, signed, STATUS_TEXT, type AnalysisData, type ExerciseStats } from './analysis';
import LineChart, { type ChartMark } from './LineChart.vue';

const props = defineProps<{ data: AnalysisData; stats: Map<string, ExerciseStats> }>();
const selected = defineModel<string | null>('selected', { required: true });

const RANGES = [
  { id: '3m', label: '3 Mon.', days: 91 },
  { id: '6m', label: '6 Mon.', days: 182 },
  { id: '1y', label: '1 Jahr', days: 365 },
  { id: 'all', label: 'Alles', days: null },
] as const;
const range = ref<(typeof RANGES)[number]['id']>('6m');

// dropdown: exercises grouped by muscle group (order of sheet "Muskelgruppen"), active ones or with data
const groups = computed(() => {
  const order = props.data.muscleGroups.map((g) => g.name);
  const byGroup = new Map<string, ExerciseStats[]>();
  for (const s of props.stats.values()) {
    if (!s.exercise.active && !s.sessions.length && !s.tests.length) continue;
    const group = s.exercise.muscleGroup || 'Ohne Muskelgruppe';
    byGroup.set(group, [...(byGroup.get(group) ?? []), s]);
  }
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
  return [...byGroup.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'de'))
    .map(([name, list]) => ({ name, items: list.map((s) => s.exercise).sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
});

const current = computed<ExerciseStats | null>(() => {
  const chosen = selected.value ? props.stats.get(selected.value) : undefined;
  if (chosen) return chosen;
  const first = groups.value[0]?.items[0];
  return first ? props.stats.get(first.id) ?? null : null;
});

const from = computed(() => {
  const days = RANGES.find((r) => r.id === range.value)!.days;
  return days === null ? null : addDays(todayIso(), -days);
});
const shown = computed(() => (current.value?.regular ?? []).filter((s) => !from.value || s.date >= from.value));
const shownTests = computed(() => (current.value?.tests ?? []).filter((t) => !from.value || t.date >= from.value));

const view = computed(() => {
  const s = current.value;
  if (!s) return null;
  const last = s.regular[s.regular.length - 1] ?? null;
  const first = shown.value[0] ?? null;
  const best = s.best;
  const bestTest = s.history.bestTest ?? null;
  const change = last && first && first !== last ? last.e1rm - first.e1rm : null;
  const days = props.data.days.filter((d) => d.exerciseIds.includes(s.exercise.id)).map((d) => d.name);
  return {
    group: s.exercise.muscleGroup || 'Ohne Muskelgruppe',
    days: days.join(', ') || 'keinem Tag zugeordnet',
    repRange: `${s.exercise.repsMin}–${s.exercise.repsMax}`,
    status: s.status,
    e1rm: last ? `${oneDecimal(last.e1rm)} kg` : '–',
    belowRecord: Boolean(last && best && last.e1rm < best.e1rm - 0.05),
    record: best ? `Rekord ${oneDecimal(best.e1rm)} kg am ${formatIsoDate(best.date).slice(0, 6)} (${signed(last!.e1rm - best.e1rm)})` : '',
    test: bestTest ? `Getestet: ${formatNumber(bestTest.kg)} kg am ${formatIsoDate(bestTest.date).slice(0, 6)}` : '',
    change: change === null ? '–' : `${signed(change)} kg`,
    changeClass: change === null || Math.abs(change) < 0.05 ? '' : change > 0 ? 'a-good' : 'a-bad',
    changePct: change !== null && first ? `${signed((change / first.e1rm) * 100)} % seit ${formatIsoDate(first.date)}` : '',
    last: last ? `${formatNumber(last.kg)} kg × ${last.reps.join('/')}` : '–',
    lastDate: last ? formatIsoDate(last.date) : '',
    next: nextTraining(s),
  };
});

const chartMarks = computed<ChartMark[]>(() => [
  ...shown.value.filter((x) => x.isRecord).map((x) => ({ date: x.date, value: x.e1rm, shape: 'circle' as const, color: 'var(--a-record)' })),
  ...shownTests.value.map((t) => ({ date: t.date, value: t.kg, shape: 'square' as const, color: 'var(--a-text)' })),
]);

// volume bars of the shown sessions, the newest one highlighted
const bars = computed(() => {
  const list = shown.value;
  if (!list.length) return null;
  const max = Math.max(...list.map((x) => x.volume), 1);
  const w = 600 / list.length;
  return list.map((x, i) => {
    const h = (170 * x.volume) / max;
    return { x: i * w + w * 0.15, y: 180 - h, w: w * 0.7, h, last: i === list.length - 1, title: `${formatIsoDate(x.date)}: ${Math.round(x.volume).toLocaleString('de-DE')} kg` };
  });
});

// last 6 entries: sessions incl. deload and 1RM tests, newest first
const rows = computed(() => {
  const s = current.value;
  if (!s) return [];
  const sessions = s.sessions.map((x) => ({
    date: x.date, kg: formatNumber(x.kg), sets: x.reps.join(' / ') + (x.deload ? ' (Deload)' : ''),
    e1rm: oneDecimal(x.e1rm), volume: `${Math.round(x.volume).toLocaleString('de-DE')} kg`, strong: x.isRecord, test: false,
  }));
  const tests = s.tests.map((t) => ({
    date: t.date, kg: formatNumber(t.kg), sets: '1 (1RM-Test)', e1rm: 'getestet', volume: '–', strong: true, test: true,
  }));
  return [...sessions, ...tests].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 6);
});
</script>

<template>
  <div class="a-bar" style="align-items: flex-end">
    <label class="a-field">
      <span class="a-label">Übung</span>
      <select class="a-select" :value="current?.exercise.id" @change="selected = ($event.target as HTMLSelectElement).value">
        <optgroup v-for="g in groups" :key="g.name" :label="g.name">
          <option v-for="e in g.items" :key="e.id" :value="e.id">{{ e.name }}</option>
        </optgroup>
      </select>
    </label>
    <div class="a-segments" role="group" aria-label="Zeitraum">
      <button v-for="r in RANGES" :key="r.id" type="button" :aria-pressed="range === r.id" @click="range = r.id">{{ r.label }}</button>
    </div>
  </div>

  <template v-if="view && current">
    <div class="a-chips">
      <span class="a-chip">{{ view.group }}</span>
      <span class="a-chip">Tag: {{ view.days }}</span>
      <span class="a-chip">Wdh: {{ view.repRange }}</span>
      <span class="a-status" :class="view.status">{{ STATUS_TEXT[view.status] }}{{ view.status === 'stalled' ? ' seit 3 Einheiten' : '' }}</span>
    </div>

    <div class="a-tiles">
      <div class="a-tile">
        <div class="a-label">Errechnetes e1RM</div>
        <div class="a-value">{{ view.e1rm }}</div>
        <div v-if="view.belowRecord" class="a-label">{{ view.record }}</div>
        <div v-if="view.test" class="a-label" style="color: var(--a-text); font-weight: 600">{{ view.test }}</div>
      </div>
      <div class="a-tile">
        <div class="a-label">Veränderung im Zeitraum</div>
        <div class="a-value" :class="view.changeClass">{{ view.change }}</div>
        <div class="a-label">{{ view.changePct }}</div>
      </div>
      <div class="a-tile">
        <div class="a-label">Letzte Einheit</div>
        <div class="a-value mid">{{ view.last }}</div>
        <div class="a-label">{{ view.lastDate }}</div>
      </div>
      <div class="a-tile framed">
        <div class="a-label">Nächstes Training</div>
        <div class="a-value">{{ view.next.kg }}</div>
        <div class="a-label">{{ view.next.hint }}</div>
      </div>
    </div>

    <section class="a-card">
      <div class="a-bar" style="gap: 8px">
        <h2>Verlauf errechnetes e1RM</h2>
        <div class="a-legend">
          <span><span style="width: 18px; height: 3px; background: var(--a-chart); display: inline-block"></span>e1RM je Einheit</span>
          <span><span class="a-dot" style="width: 10px; height: 10px; background: var(--a-record)"></span>neuer Rekord</span>
          <span><span style="width: 10px; height: 10px; background: var(--a-text); display: inline-block"></span>1RM-Test (gehoben)</span>
        </div>
      </div>
      <LineChart
        :lines="[{ points: shown.map((x) => ({ date: x.date, value: x.e1rm })), color: 'var(--a-chart)' }]"
        :marks="chartMarks"
        :from="from ?? undefined"
        :to="from ? todayIso() : undefined"
        label="Linienchart errechnetes e1RM je Einheit"
      />
    </section>

    <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: stretch">
      <section class="a-card" style="flex: 1 1 420px; min-width: 0">
        <h2>Volumen je Einheit (kg × Wdh)</h2>
        <svg v-if="bars" viewBox="0 0 600 200" role="img" aria-label="Säulenchart Volumen je Einheit" style="width: 100%; height: auto; display: block">
          <line x1="0" x2="600" y1="180" y2="180" stroke="var(--a-line)" />
          <rect v-for="(b, i) in bars" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.last ? 'var(--a-chart)' : 'var(--a-neutral)'">
            <title>{{ b.title }}</title>
          </rect>
        </svg>
        <p v-else class="a-note">Noch keine Einheit in diesem Zeitraum.</p>
      </section>
      <section class="a-card" style="flex: 1 1 420px; min-width: 0">
        <h2>Letzte Einheiten</h2>
        <div class="a-scroll">
          <table class="a-table">
            <thead><tr><th>Datum</th><th>kg</th><th>Sätze</th><th class="num">e1RM</th><th class="num">Volumen</th></tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.date + r.sets">
                <td>{{ formatIsoDate(r.date) }}</td>
                <td>{{ r.kg }}</td>
                <td>{{ r.sets }}</td>
                <td class="num" :style="{ fontWeight: r.strong ? 700 : 400, color: r.strong && !r.test ? 'var(--a-record)' : undefined }">{{ r.e1rm }}</td>
                <td class="num">{{ r.volume }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!rows.length" class="a-note">Noch keine Einheit gespeichert.</p>
        </div>
      </section>
    </div>
  </template>
  <p v-else class="a-note">Im Übungsstamm gibt es noch keine Übung.</p>
</template>
