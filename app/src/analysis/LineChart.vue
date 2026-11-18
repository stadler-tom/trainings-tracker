<script setup lang="ts">
// Line chart over time with optional marks (records, tests, single weighings). Plain SVG, no library.
import { computed } from 'vue';
import { formatIsoDate } from '../format';

export interface ChartPoint { date: string; value: number }
export interface ChartMark extends ChartPoint { shape: 'circle' | 'square'; color: string; size?: number }

const props = defineProps<{
  lines: { points: ChartPoint[]; color: string }[];
  marks?: ChartMark[];
  label: string;                   // accessible description
  from?: string;                   // x range; default: first to last date in the data
  to?: string;
  digits?: number;                 // decimals of the y labels
}>();

const W = 900, H = 280, X0 = 64, X1 = 884, Y0 = 16, Y1 = 248;
const day = (iso: string) => Date.parse(iso) / 86_400_000;

const chart = computed(() => {
  const all = [...props.lines.flatMap((l) => l.points), ...(props.marks ?? [])];
  if (!all.length) return null;
  const dates = all.map((p) => day(p.date));
  const start = props.from ? day(props.from) : Math.min(...dates);
  const end = props.to ? day(props.to) : Math.max(...dates);
  const values = all.map((p) => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, 0.5);
  lo -= pad; hi += pad;
  const x = (iso: string) => (end === start ? (X0 + X1) / 2 : X0 + ((day(iso) - start) / (end - start)) * (X1 - X0));
  const y = (v: number) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
  const ticks = [0, 1, 2, 3].map((k) => {
    const v = lo + ((hi - lo) * k) / 3;
    const digits = props.digits ?? (hi - lo < 8 ? 1 : 0);   // small ranges need a decimal, or labels repeat
    return { y: y(v), label: v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) };
  });
  const fmt = (n: number) => formatIsoDate(new Date(n * 86_400_000).toISOString().slice(0, 10));
  return {
    ticks,
    lines: props.lines.map((l) => ({
      color: l.color,
      points: l.points.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    })),
    marks: (props.marks ?? []).map((m) => ({ ...m, cx: x(m.date), cy: y(m.value), r: m.size ?? 5 })),
    xLabels: [fmt(start), fmt((start + end) / 2), fmt(end)],
  };
});
</script>

<template>
  <svg v-if="chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="label" style="width: 100%; height: auto; display: block">
    <g v-for="(tick, i) in chart.ticks" :key="i">
      <line :x1="X0" :x2="X1" :y1="tick.y" :y2="tick.y" stroke="var(--a-line)" stroke-width="1" />
      <text :x="X0 - 8" :y="tick.y + 4" text-anchor="end" font-size="12" fill="var(--a-muted)">{{ tick.label }}</text>
    </g>
    <polyline v-for="(l, i) in chart.lines" :key="i" :points="l.points" fill="none" :stroke="l.color"
      stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    <template v-for="m in chart.marks" :key="`${m.date}-${m.cx}-${m.cy}-${m.shape}`">
      <circle v-if="m.shape === 'circle'" :cx="m.cx" :cy="m.cy" :r="m.r" :fill="m.color" />
      <rect v-else :x="m.cx - m.r" :y="m.cy - m.r" :width="2 * m.r" :height="2 * m.r" :fill="m.color" />
    </template>
    <text :x="X0" y="272" font-size="12" fill="var(--a-muted)">{{ chart.xLabels[0] }}</text>
    <text :x="(X0 + X1) / 2" y="272" text-anchor="middle" font-size="12" fill="var(--a-muted)">{{ chart.xLabels[1] }}</text>
    <text :x="X1" y="272" text-anchor="end" font-size="12" fill="var(--a-muted)">{{ chart.xLabels[2] }}</text>
  </svg>
  <p v-else class="a-note">Noch keine Daten in diesem Zeitraum.</p>
</template>
