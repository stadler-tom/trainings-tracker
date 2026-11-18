<script setup lang="ts">
// Time range buttons of a chart: 1 week, 1 month, 6 months, everything.
import { CHART_RANGES, type ChartRange } from './analysis';

const range = defineModel<ChartRange>({ required: true });
defineProps<{ label: string }>();
</script>

<template>
  <div class="a-segments" role="group" :aria-label="label">
    <button v-for="r in CHART_RANGES" :key="r.id" type="button" :aria-pressed="range === r.id" @click="range = r.id">{{ r.label }}</button>
  </div>
</template>
