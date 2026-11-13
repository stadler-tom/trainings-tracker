<script setup lang="ts">
// Body weight of the last 12 weeks: daily weighings as dots, 7-day average as line.
import { computed } from 'vue';
import type { BodyEntry } from '../api';
import { movingAverage } from '../body';
import { formatNumber } from '../training';

const props = defineProps<{ body: BodyEntry[]; today: string }>();

const WIDTH = 340;
const HEIGHT = 170;
const PAD = { left: 38, right: 10, top: 12, bottom: 24 };
const WEEKS = 12;
const DAY_MS = 86_400_000;

const from = computed(() => new Date(Date.parse(props.today) - WEEKS * 7 * DAY_MS).toISOString().slice(0, 10));
const points = computed(() =>
  props.body.filter((b) => b.weight !== null && b.date >= from.value && b.date <= props.today) as { date: string; weight: number }[]);
const average = computed(() => movingAverage(props.body).filter((p) => p.date >= from.value && p.date <= props.today));

const scale = computed(() => {
  const values = points.value.map((p) => p.weight);
  const low = Math.floor(Math.min(...values) - 0.5);
  const high = Math.ceil(Math.max(...values) + 0.5);
  const start = Date.parse(points.value[0].date);
  const end = Math.max(Date.parse(props.today), start + DAY_MS);
  return {
    low, high,
    x: (iso: string) => PAD.left + ((Date.parse(iso) - start) / (end - start)) * (WIDTH - PAD.left - PAD.right),
    y: (kg: number) => PAD.top + ((high - kg) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom),
  };
});

const ticks = computed(() => {
  const { low, high } = scale.value;
  const step = Math.max(1, Math.ceil((high - low) / 4));
  const result: number[] = [];
  for (let v = low; v <= high; v += step) result.push(v);
  return result;
});

const line = computed(() => average.value.map((p) => `${scale.value.x(p.date).toFixed(1)},${scale.value.y(p.value).toFixed(1)}`).join(' '));

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}.${month}.`;
}
</script>

<template>
  <svg v-if="points.length >= 2" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="chart" role="img"
    aria-label="Körpergewicht der letzten 12 Wochen mit 7-Tage-Schnitt">
    <g class="grid">
      <g v-for="tick in ticks" :key="tick">
        <line :x1="PAD.left" :x2="WIDTH - PAD.right" :y1="scale.y(tick)" :y2="scale.y(tick)" />
        <text :x="PAD.left - 6" :y="scale.y(tick) + 4" text-anchor="end">{{ formatNumber(tick) }}</text>
      </g>
      <text :x="PAD.left" :y="HEIGHT - 6">{{ shortDate(points[0].date) }}</text>
      <text :x="WIDTH - PAD.right" :y="HEIGHT - 6" text-anchor="end">{{ shortDate(points[points.length - 1].date) }}</text>
    </g>
    <circle v-for="p in points" :key="p.date" class="dot" :cx="scale.x(p.date)" :cy="scale.y(p.weight)" r="3" />
    <polyline class="average" :points="line" />
  </svg>
  <p v-else class="muted small">Ab zwei Wiegungen erscheint hier der Verlauf.</p>
</template>

<style scoped>
.chart { width: 100%; height: auto; display: block; }
.grid line { stroke: var(--muted); stroke-opacity: 0.25; stroke-width: 1; }
.grid text { fill: var(--muted); font-size: 11px; }
.dot { fill: var(--muted); fill-opacity: 0.55; }
.average { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
</style>
