<script setup lang="ts">
import { computed } from 'vue';
import { isOlderVersion, MIN_API_VERSION, UPDATE_GUIDE_URL, type State } from '../api';
import { formatIsoDate } from '../format';

const props = defineProps<{
  configured: boolean;
  state: State | null;
  loading: boolean;
  error: string;
  runningDay: string | null;
}>();
const emit = defineEmits<{ openDay: [day: string]; openSettings: []; reload: [] }>();

const apiOutdated = computed(() => props.state != null && isOlderVersion(props.state.apiVersion, MIN_API_VERSION));
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

    <p v-else-if="loading && !state" class="muted">Lade Trainingstage …</p>

    <template v-else-if="error && !state">
      <p class="message error">{{ error }}</p>
      <button @click="emit('reload')">Erneut versuchen</button>
    </template>

    <template v-else-if="state">
      <p v-if="apiOutdated" class="message error">
        Das Script in deinem Sheet ist veraltet (mindestens {{ MIN_API_VERSION }} nötig).
        <a :href="UPDATE_GUIDE_URL" target="_blank" rel="noopener">Anleitung zum Aktualisieren</a>
      </p>
      <p class="muted">Welcher Trainingstag ist heute?</p>
      <button v-for="day in state.days" :key="day.name" class="big day" @click="emit('openDay', day.name)">
        <span>{{ day.name }}</span>
        <small class="muted">{{ day.lastDate ? 'zuletzt ' + formatIsoDate(day.lastDate) : 'noch nie' }}</small>
      </button>
      <p v-if="error" class="message error">{{ error }}</p>
    </template>
  </main>
</template>

<style scoped>
.continue { text-align: center; font-size: 1.05rem; }
</style>
