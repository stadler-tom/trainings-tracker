<script setup lang="ts">
// Working sets per muscle group and week against the targets from sheet "Muskelgruppen".
import { computed, ref } from 'vue';
import { addDays, formatIsoDate, todayIso } from '../format';
import { weekStart } from '../body';
import { weeklySets, weeksBetween, type AnalysisData } from './analysis';

const props = defineProps<{ data: AnalysisData }>();

const HEAT_WEEKS = 12;
const thisWeek = weekStart(todayIso());
// every week from the first training (at most two years back) up to now
const weeks = computed(() => {
  const first = props.data.log[0]?.[0] ?? thisWeek;
  const start = first < addDays(thisWeek, -730) ? addDays(thisWeek, -730) : first;
  return weeksBetween(start, thisWeek);
});
const sets = computed(() => weeklySets(props.data, weeks.value));
const index = ref<number | null>(null);
// start with the running week, or with the last one while nothing is logged yet this week
const selected = computed(() => {
  if (index.value !== null) return index.value;
  const last = weeks.value.length - 1;
  const running = [...sets.value.values()].some((v) => v[last]?.sets > 0);
  return running || last === 0 ? last : last - 1;
});

/** ISO calendar week number of a Monday. */
function calendarWeek(monday: string): number {
  const thursday = new Date(Date.parse(addDays(monday, 3)));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const targets = computed(() => new Map(props.data.muscleGroups.map((g) => [g.name, g])));
const hasTarget = (name: string) => {
  const t = targets.value.get(name);
  return Boolean(t && t.setsMin !== null && t.setsMax !== null);
};
// groups with a target first (sheet order), groups without one at the end, shown in grey
const groupNames = computed(() => {
  const names = [...sets.value.keys()];
  return [...names.filter(hasTarget), ...names.filter((n) => !hasTarget(n))];
});
const anyDeload = (i: number) => [...sets.value.values()].some((v) => v[i]?.deload);

const weekLabel = computed(() => {
  const monday = weeks.value[selected.value];
  return `KW ${calendarWeek(monday)} · ${formatIsoDate(monday).slice(0, 6)}–${formatIsoDate(addDays(monday, 6)).slice(0, 6)}` +
    (anyDeload(selected.value) ? ' (Deload)' : '') + (selected.value === weeks.value.length - 1 ? ' (läuft)' : '');
});

const scaleMax = computed(() => {
  let max = 24;
  for (const [name, values] of sets.value) {
    const t = targets.value.get(name);
    max = Math.max(max, values[selected.value]?.sets ?? 0, t?.setsMax ?? 0);
  }
  return max;
});
const pct = (v: number) => `${((Math.min(v, scaleMax.value) / scaleMax.value) * 100).toFixed(1)}%`;

function judge(value: number, name: string): 'under' | 'in' | 'over' | 'none' {
  const t = targets.value.get(name);
  if (!t || t.setsMin === null || t.setsMax === null) return 'none';
  return value < t.setsMin ? 'under' : value > t.setsMax ? 'over' : 'in';
}
const BAR_COLOR = { under: '#b45309', in: '#15803d', over: '#1d4ed8', none: 'var(--a-neutral)' };
const CELL = {
  under: { bg: '#fde68a', fg: '#1f2937' }, in: { bg: '#bbf7d0', fg: '#1f2937' },
  over: { bg: '#1d4ed8', fg: '#ffffff' }, none: { bg: 'var(--a-line)', fg: 'var(--a-muted)' },
};

const bars = computed(() => groupNames.value.map((name) => {
  const value = sets.value.get(name)![selected.value]?.sets ?? 0;
  const t = targets.value.get(name);
  const hasTarget = t && t.setsMin !== null && t.setsMax !== null;
  return {
    name, value, muted: !hasTarget,
    target: hasTarget ? `${t!.setsMin}–${t!.setsMax}` : 'kein Ziel',
    bandLeft: hasTarget ? pct(t!.setsMin!) : '0%',
    bandWidth: hasTarget ? `${(((Math.min(t!.setsMax!, scaleMax.value) - t!.setsMin!) / scaleMax.value) * 100).toFixed(1)}%` : '0%',
    hasTarget, width: pct(value), color: BAR_COLOR[judge(value, name)],
  };
}));

const heatRange = computed(() => {
  const end = selected.value;
  const start = Math.max(0, end - HEAT_WEEKS + 1);
  return Array.from({ length: end - start + 1 }, (_, k) => start + k);
});
const heat = computed(() => groupNames.value.map((name) => ({
  name,
  muted: !hasTarget(name),
  cells: heatRange.value.map((i) => {
    const cell = sets.value.get(name)![i];
    return { value: cell.sets, deload: cell.deload, ...CELL[judge(cell.sets, name)], current: i === selected.value };
  }),
})));
</script>

<template>
  <div class="a-bar">
    <h1>Volumen je Muskelgruppe</h1>
    <div style="display: flex; align-items: center; gap: 8px">
      <button type="button" class="a-icon-button" aria-label="Vorherige Woche" :disabled="selected === 0" @click="index = selected - 1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div style="min-width: 230px; text-align: center; font-weight: 600">{{ weekLabel }}</div>
      <button type="button" class="a-icon-button" aria-label="Nächste Woche" :disabled="selected === weeks.length - 1" @click="index = selected + 1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  </div>

  <section class="a-card" style="gap: 14px">
    <div class="a-bar" style="gap: 8px">
      <h2>Arbeitssätze in der Woche</h2>
      <div class="a-legend">
        <span><span style="width: 18px; height: 10px; background: #dcfce7; border: 1px solid #86efac; display: inline-block"></span>Zielbereich</span>
        <span><span style="width: 18px; height: 10px; background: #b45309; display: inline-block"></span>unter Ziel</span>
        <span><span style="width: 18px; height: 10px; background: #15803d; display: inline-block"></span>im Ziel</span>
        <span><span style="width: 18px; height: 10px; background: #1d4ed8; display: inline-block"></span>über Ziel</span>
      </div>
    </div>
    <div v-for="b in bars" :key="b.name" :style="{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr) 110px', gap: '14px', alignItems: 'center', color: b.muted ? 'var(--a-muted)' : undefined }">
      <div :style="{ fontWeight: b.muted ? 400 : 600 }">{{ b.name }}</div>
      <div style="position: relative; height: 28px; background: var(--a-bg); border-radius: 6px">
        <div v-if="b.hasTarget" :style="{ position: 'absolute', top: 0, bottom: 0, left: b.bandLeft, width: b.bandWidth, background: '#dcfce7', borderLeft: '1px solid #86efac', borderRight: '1px solid #86efac' }"></div>
        <div :style="{ position: 'absolute', top: '7px', height: '14px', left: 0, width: b.width, background: b.color, borderRadius: '0 4px 4px 0' }"></div>
      </div>
      <div style="text-align: right; font-variant-numeric: tabular-nums"><strong>{{ b.value }}</strong> <span class="a-muted">/ {{ b.target }}</span></div>
    </div>
    <p v-if="!bars.length" class="a-note">Noch keine Muskelgruppen im Blatt „Muskelgruppen“.</p>
    <p class="a-note">Zählt alle gespeicherten Sätze außer 1RM-Tests und Aufwärmübungen, bei der aktuellen Muskelgruppe der Übung. Gruppen und Zielbereiche kommen aus dem Blatt „Muskelgruppen“ im Tracker.</p>
  </section>

  <section class="a-card">
    <h2>Die letzten {{ heatRange.length }} Wochen</h2>
    <div class="a-scroll">
      <table style="width: 100%; min-width: 820px; border-collapse: separate; border-spacing: 4px; font-size: 13px; font-variant-numeric: tabular-nums">
        <thead>
          <tr>
            <th style="text-align: left; padding: 4px 6px" class="a-muted">Gruppe</th>
            <th v-for="i in heatRange" :key="i" :style="{ padding: '4px 2px', color: i === selected ? 'var(--a-accent)' : 'var(--a-muted)', fontWeight: i === selected ? 700 : 500 }">
              KW {{ calendarWeek(weeks[i]) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in heat" :key="row.name">
            <th scope="row" :style="{ textAlign: 'left', padding: '4px 6px', fontWeight: row.muted ? 400 : 700, color: row.muted ? 'var(--a-muted)' : undefined }">{{ row.name }}</th>
            <td v-for="(c, k) in row.cells" :key="k"
              :style="{ textAlign: 'center', padding: '8px 2px', borderRadius: '6px', background: c.bg, color: c.fg, outline: c.current ? '2px solid var(--a-accent)' : 'none' }">
              {{ c.value }}{{ c.deload ? ' D' : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="a-legend">
      <span><span style="width: 14px; height: 14px; border-radius: 4px; background: #fde68a; display: inline-block"></span>unter Ziel</span>
      <span><span style="width: 14px; height: 14px; border-radius: 4px; background: #bbf7d0; display: inline-block"></span>im Ziel</span>
      <span><span style="width: 14px; height: 14px; border-radius: 4px; background: #1d4ed8; display: inline-block"></span>über Ziel</span>
      <span>grau = kein Zielbereich</span>
      <span>D = Deload-Woche</span>
    </div>
  </section>
</template>
