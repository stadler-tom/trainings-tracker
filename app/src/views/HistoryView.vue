<script setup lang="ts">
// Training history (API 1.6.0+): every saved training, newest first, grouped by month.
// A tap loads the training and shows its summary. Read only: the log is never changed from the app.
import { computed, ref } from 'vue';
import { errorMessage, getTraining, type State, type TrainingOverview } from '../api';
import { formatMonth, formatShortDate } from '../format';
import type { Settings } from '../storage';
import { summaryFromDetail, type Summary } from '../summary';
import LoadingSpinner from './LoadingSpinner.vue';
import SummaryOverlay from './SummaryOverlay.vue';

const props = defineProps<{
  state: State | null;
  settings: Settings;
}>();
const emit = defineEmits<{ back: [] }>();

const months = computed(() => {
  const groups: { label: string; trainings: TrainingOverview[] }[] = [];
  for (const training of props.state?.trainings ?? []) {
    const label = formatMonth(training.date);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.trainings.push(training);
    else groups.push({ label, trainings: [training] });
  }
  return groups;
});


const opening = ref<string | null>(null);      // key of the training being loaded
const summary = ref<Summary | null>(null);
const message = ref('');

async function open(training: TrainingOverview) {
  const key = `${training.date}|${training.day}`;
  if (opening.value) return;
  opening.value = key;
  message.value = '';
  try {
    summary.value = summaryFromDetail(await getTraining(props.settings, training.date, training.day));
  } catch (error) {
    message.value = errorMessage(error);
  } finally {
    opening.value = null;
  }
}

function close() {
  summary.value = null;
}
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Start</button>
      <h1>Verlauf</h1>
    </header>

    <p v-if="message" class="message error" role="alert">{{ message }}</p>
    <LoadingSpinner v-if="!state" label="Lade Verlauf …" />
    <p v-else-if="!state.trainings?.length" class="muted">Noch keine Trainings gespeichert.</p>

    <section v-for="month in months" :key="month.label" class="month">
      <h2 class="muted">{{ month.label }}</h2>
      <button
        v-for="training in month.trainings"
        :key="training.date + training.day"
        class="big training"
        :disabled="opening !== null"
        @click="open(training)"
      >
        <span class="what">
          <strong>{{ training.day }}</strong>
          <span v-if="training.deload" class="badge">Deload</span>
        </span>
        <small class="muted">
          {{ formatShortDate(training.date) }} ·
          <template v-if="opening === training.date + '|' + training.day">lade …</template>
          <template v-else>{{ training.sets }} Sätze · {{ training.volume.toLocaleString('de-DE') }} kg</template>
        </small>
      </button>
    </section>

    <SummaryOverlay v-if="summary" :summary="summary" close-label="Schließen" @close="close" />
  </main>
</template>

<style scoped>
.month { display: flex; flex-direction: column; gap: 8px; }
.month h2 { font-size: 0.95rem; font-weight: 600; margin: 8px 0 0; }
.training { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; }
.what { display: flex; align-items: center; gap: 8px; max-width: 100%; }
.what strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
</style>
