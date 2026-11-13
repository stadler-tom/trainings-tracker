<script setup lang="ts">
import { computed } from 'vue';
import { isOlderVersion, MIN_API_VERSION, UPDATE_GUIDE_URL, type State } from '../api';
import { formatIsoDate } from '../format';
import { daysForToday } from '../training';
import LoadingSpinner from './LoadingSpinner.vue';

const props = defineProps<{
  configured: boolean;
  state: State | null;
  loading: boolean;
  error: string;
  runningDay: string | null;
}>();
const emit = defineEmits<{ openDay: [day: string]; openSettings: []; reload: [] }>();

// hint only: the day usually trained on today's weekday gets a frame (derived from the log)
const todayDays = computed(() => (props.state ? daysForToday(props.state.days) : []));

const apiOutdated = computed(() => props.state != null && isOlderVersion(props.state.apiVersion, MIN_API_VERSION));

// The day cards slide in one after another only when they arrive from loading,
// not every time the start screen is shown again with data already there.
const animateDays = !props.state;
const STAGGER_MS = 80;
</script>

<template>
  <main class="screen">
    <header class="bar">
      <h1>Training</h1>
      <button class="ghost" @click="emit('openSettings')">Einstellungen</button>
    </header>

    <button v-if="runningDay" class="big primary continue" @click="emit('openDay', runningDay)">
      Ungespeichertes Training „{{ runningDay }}“ fortsetzen
    </button>

    <template v-if="!configured">
      <p class="muted">Die App ist noch nicht mit deinem Google Sheet verbunden.</p>
      <button class="big" @click="emit('openSettings')">Jetzt einrichten</button>
    </template>

    <LoadingSpinner v-else-if="loading && !state" label="Lade Trainingstage …" />

    <template v-else-if="error && !state">
      <p class="message error">{{ error }}</p>
      <button @click="emit('reload')">Erneut versuchen</button>
    </template>

    <template v-else-if="state">
      <p v-if="apiOutdated" class="message error">
        Das Script in deinem Sheet ist veraltet (mindestens {{ MIN_API_VERSION }} nötig).
        <a :href="UPDATE_GUIDE_URL" target="_blank" rel="noopener">Anleitung zum Aktualisieren</a>
      </p>
      <p class="muted" :class="{ 'slide-in': animateDays }">Welcher Trainingstag ist heute?</p>
      <button
        v-for="(day, index) in state.days"
        :key="day.name"
        class="big day"
        :class="{ 'slide-in': animateDays, today: todayDays.includes(day.name) }"
        :style="animateDays ? { animationDelay: `${(index + 1) * STAGGER_MS}ms` } : undefined"
        @click="emit('openDay', day.name)"
      >
        <span class="name">
          {{ day.name }}
          <span v-if="todayDays.includes(day.name)" class="today-label">Heute</span>
        </span>
        <small class="muted">{{ day.lastDate ? 'zuletzt ' + formatIsoDate(day.lastDate) : 'noch nie' }}</small>
      </button>
      <p v-if="error" class="message error">{{ error }}</p>
    </template>
  </main>
</template>

<style scoped>
.continue { text-align: center; font-size: 1.05rem; }

.day.today { outline: 3px solid var(--today); outline-offset: -3px; }
.name { display: flex; align-items: center; gap: 10px; }
.today-label {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  background: var(--today);
}
@media (prefers-color-scheme: dark) {
  .today-label { color: #0b1220; }
}

.slide-in {
  animation: slide-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

/* iPhone setting "Reduce Motion": fade only, no movement */
@media (prefers-reduced-motion: reduce) {
  .slide-in { animation-name: fade-in; animation-duration: 200ms; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
