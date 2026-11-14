<script setup lang="ts">
import { computed } from 'vue';
import { isOlderVersion, MIN_API_VERSION, UPDATE_GUIDE_URL, type State } from '../api';
import { formatIsoDate, localDate } from '../format';
import { deloadStatus } from '../deload';
import { daysDoneToday, daysForToday } from '../training';
import LoadingSpinner from './LoadingSpinner.vue';

const props = defineProps<{
  configured: boolean;
  state: State | null;
  loading: boolean;
  error: string;
  runningDay: string | null;
  today: string;                   // yyyy-MM-dd, follows midnight
}>();
const emit = defineEmits<{ openDay: [day: string]; openSettings: []; openHistory: []; openBody: []; reload: [] }>();

// hint only: the day usually trained on today's weekday gets a frame (derived from the log)
const todayDays = computed(() => (props.state ? daysForToday(props.state.days, localDate(props.today)) : []));
// a day with a training saved today is shown as done (instead of the "today" hint)
const doneDays = computed(() => (props.state ? daysDoneToday(props.state.days, props.today) : []));

const apiOutdated = computed(() => props.state != null && isOlderVersion(props.state.apiVersion, MIN_API_VERSION));
// shown only while a deload is due or running (the box in the training is then ticked)
const deload = computed(() => (props.state ? deloadStatus(props.state, props.today) : null));

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
      <div v-if="deload && deload.kind !== 'none'" class="deload">
        <strong>{{ deload.kind === 'due' ? 'Deload-Woche fällig' : 'Deload-Woche' }}</strong>
        <span>{{ deload.reason }} Der Haken „Deload“ ist beim Training schon gesetzt.</span>
        <details>
          <summary>Was ist ein Deload?</summary>
          <p>
            Eine Woche mit weniger Belastung, damit sich Gelenke, Sehnen und Nervensystem von der
            Ermüdung der letzten Wochen erholen. Du trainierst ganz normal weiter, aber mit der
            Hälfte der Sätze, dem gleichen Gewicht und ohne bis ans Versagen zu gehen
            (3–4 Wiederholungen Reserve). Muskeln gehen dabei nicht verloren. Danach geht es
            ausgeruht mit voller Kraft weiter.
          </p>
        </details>
      </div>
      <p class="muted" :class="{ 'slide-in': animateDays }">
        Welcher Trainingstag ist heute?
        <span v-if="loading" class="refreshing">· aktualisiere …</span>
      </p>
      <button
        v-for="(day, index) in state.days"
        :key="day.name"
        class="big day"
        :class="{
          'slide-in': animateDays,
          done: doneDays.includes(day.name),
          today: todayDays.includes(day.name) && !doneDays.includes(day.name),
        }"
        :style="animateDays ? { animationDelay: `${(index + 1) * STAGGER_MS}ms` } : undefined"
        @click="emit('openDay', day.name)"
      >
        <span class="name">
          {{ day.name }}
          <span v-if="doneDays.includes(day.name)" class="badge done-label">✓ Erledigt</span>
          <span v-else-if="todayDays.includes(day.name)" class="badge today-label">Heute</span>
        </span>
        <small class="muted">{{ doneDays.includes(day.name) ? 'heute gespeichert'
          : day.lastDate ? 'zuletzt ' + formatIsoDate(day.lastDate) : 'noch nie' }}</small>
      </button>
      <div class="more" :class="{ 'slide-in': animateDays }"
        :style="animateDays ? { animationDelay: `${(state.days.length + 1) * STAGGER_MS}ms` } : undefined">
        <button class="big" @click="emit('openHistory')">📋 Verlauf</button>
        <button class="big" @click="emit('openBody')">⚖️ Körper</button>
      </div>
      <p v-if="error" class="message error">{{ error }}</p>
    </template>
  </main>
</template>

<style scoped>
.continue { text-align: center; font-size: 1.05rem; }

.deload {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  border-left: 4px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.deload details { margin-top: 4px; }
.deload summary { cursor: pointer; color: var(--accent); font-weight: 600; }
.deload details p { margin: 6px 0 0; }
.refreshing { font-size: 0.85rem; }
.more { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.more button { text-align: center; }

.day.today { outline: 3px solid var(--today); outline-offset: -3px; }
.day.done { outline: 3px solid var(--done); outline-offset: -3px; }
.name { display: flex; align-items: center; gap: 10px; }
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
}
.today-label { background: var(--today); }
.done-label { background: var(--done); }
@media (prefers-color-scheme: dark) {
  .badge { color: #0b1220; }
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
