<script setup lang="ts">
// Start page: all active exercises grouped by muscle group, with status and next training.
import { computed, ref } from 'vue';
import { addDays, formatIsoDate, todayIso } from '../format';
import { formatNumber } from '../training';
import { e1rmChangeSince, nextTraining, perSetCount, sessionText, oneDecimal, signed, STATUS_TEXT, type AnalysisData, type ExerciseStats } from './analysis';

const props = defineProps<{ data: AnalysisData; stats: Map<string, ExerciseStats> }>();
const emit = defineEmits<{ open: [id: string] }>();

const today = todayIso();
const SIX_WEEKS_AGO = addDays(today, -42);
const MONTH_AGO = addDays(today, -30);
const day = ref('Alle');
const onlyStalled = ref(false);

const daysOf = (id: string) => props.data.days.filter((d) => d.exerciseIds.includes(id)).map((d) => d.name);

interface Row {
  id: string; name: string; days: string; lastDate: string; lastValues: string; e1rm: string;
  delta: string; deltaClass: string; spark: string; status: ExerciseStats['status']; next: string;
}

function rowOf(s: ExerciseStats): Row {
  const last = s.regular[s.regular.length - 1];
  const change = e1rmChangeSince(s, SIX_WEEKS_AGO);
  const tail = s.regular.slice(-12).map((x) => x.e1rm);
  const lo = Math.min(...tail), hi = Math.max(...tail);
  const spark = tail.length > 1
    ? tail.map((v, i) => `${((i * 120) / (tail.length - 1)).toFixed(1)},${(28 - (24 * (v - lo)) / Math.max(hi - lo, 0.1)).toFixed(1)}`).join(' ')
    : '';
  const setCount = perSetCount(props.data, s);
  const next = nextTraining(s, setCount);
  const inc = s.exercise.increment;
  const nextText = setCount || s.status === 'jump' || !last || inc <= 0 || next.kg.includes('(')
    ? next.kg
    : `${next.kg} · ab ${s.exercise.repsMax} Wdh in Satz 1 → ${formatNumber(last.kg + inc)} kg`;
  return {
    id: s.exercise.id, name: s.exercise.name, days: daysOf(s.exercise.id).join(', ') || '–',
    lastDate: last ? formatIsoDate(last.date).slice(0, 6) : '–',
    lastValues: last ? sessionText(last) : '–',
    e1rm: last ? oneDecimal(last.e1rm) : '–',
    delta: change === null ? '–' : `${signed(change)} kg`,
    deltaClass: change === null || Math.abs(change) < 0.05 ? '' : change > 0 ? 'a-good' : 'a-bad',
    spark, status: s.status, next: nextText,
  };
}

const active = computed(() => [...props.stats.values()].filter((s) => s.exercise.active));

const tiles = computed(() => ({
  up: active.value.filter((s) => (e1rmChangeSince(s, SIX_WEEKS_AGO) ?? 0) > 0.05).length,
  stalled: active.value.filter((s) => s.status === 'stalled').length,
  records: active.value.reduce((n, s) => n + s.regular.filter((x) => x.isRecord && x.date >= MONTH_AGO).length, 0),
  jump: active.value.filter((s) => s.status === 'jump').length,
}));

const groups = computed(() => {
  const order = props.data.muscleGroups.map((g) => g.name);
  const byGroup = new Map<string, Row[]>();
  for (const s of active.value) {
    if (day.value !== 'Alle' && !daysOf(s.exercise.id).includes(day.value)) continue;
    if (onlyStalled.value && s.status !== 'stalled') continue;
    const group = s.exercise.muscleGroup || 'Ohne Muskelgruppe';
    byGroup.set(group, [...(byGroup.get(group) ?? []), rowOf(s)]);
  }
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
  return [...byGroup.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'de'))
    .map(([name, rows]) => ({ name, rows: rows.sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
});
</script>

<template>
  <div class="a-bar">
    <h1>Alle Übungen</h1>
    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
      <div class="a-segments" role="group" aria-label="Trainingstag">
        <button v-for="d in ['Alle', ...data.days.map((x) => x.name)]" :key="d" type="button" :aria-pressed="day === d" @click="day = d">{{ d }}</button>
      </div>
      <label class="a-check"><input v-model="onlyStalled" type="checkbox" /> Nur Stagnation</label>
    </div>
  </div>

  <div class="a-tiles">
    <div class="a-tile"><div class="a-label">Übungen mit Fortschritt</div><div class="a-value a-good">{{ tiles.up }}</div><div class="a-label">e1RM über 6 Wochen gestiegen</div></div>
    <div class="a-tile"><div class="a-label">Stagnation</div><div class="a-value" style="color: #b45309">{{ tiles.stalled }}</div><div class="a-label">3 Einheiten ohne neuen Bestwert</div></div>
    <div class="a-tile"><div class="a-label">Rekorde im letzten Monat</div><div class="a-value" style="color: var(--a-record)">{{ tiles.records }}</div><div class="a-label">neue e1RM-Bestwerte</div></div>
    <div class="a-tile"><div class="a-label">Gewichtssprung fällig</div><div class="a-value">{{ tiles.jump }}</div><div class="a-label">beim nächsten Training</div></div>
  </div>

  <section class="a-card a-scroll" style="padding: 8px 12px 12px">
    <table class="a-table" style="min-width: 980px">
      <thead>
        <tr>
          <th>Übung</th><th>Tag</th><th>Letzte Einheit</th><th>Letzte Werte</th><th class="num">e1RM</th>
          <th class="num">6 Wochen</th><th>Verlauf</th><th>Status</th><th>Nächstes Training</th>
        </tr>
      </thead>
      <tbody v-for="g in groups" :key="g.name">
        <tr class="group"><th colspan="9" scope="colgroup">{{ g.name }}</th></tr>
        <tr v-for="r in g.rows" :key="r.id">
          <td><button type="button" class="a-link" @click="emit('open', r.id)">{{ r.name }}</button></td>
          <td>{{ r.days }}</td>
          <td>{{ r.lastDate }}</td>
          <td>{{ r.lastValues }}</td>
          <td class="num" style="font-weight: 600">{{ r.e1rm }}</td>
          <td class="num" :class="r.deltaClass">{{ r.delta }}</td>
          <td style="padding: 4px 8px">
            <svg v-if="r.spark" viewBox="0 0 120 32" width="120" height="32" aria-hidden="true" style="display: block">
              <polyline :points="r.spark" fill="none" stroke="var(--a-chart)" stroke-width="2" stroke-linejoin="round" />
            </svg>
          </td>
          <td><span class="a-status" :class="r.status">{{ STATUS_TEXT[r.status] }}</span></td>
          <td>{{ r.next }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!groups.length" class="a-note" style="padding: 12px 8px">Keine Übung passt zu diesem Filter.</p>
  </section>
</template>
