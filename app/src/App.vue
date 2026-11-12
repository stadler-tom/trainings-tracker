<script setup lang="ts">
import { ref } from 'vue';
import StartView from './views/StartView.vue';
import TrainingView from './views/TrainingView.vue';
import SettingsView from './views/SettingsView.vue';

// Three screens are enough for a simple switch; no router needed.
type Screen = 'start' | 'training' | 'settings';
const screen = ref<Screen>('start');
const selectedDay = ref<string | null>(null);

function openDay(day: string) {
  selectedDay.value = day;
  screen.value = 'training';
}
</script>

<template>
  <StartView v-if="screen === 'start'" @open-day="openDay" @open-settings="screen = 'settings'" />
  <TrainingView v-else-if="screen === 'training'" :day="selectedDay" @back="screen = 'start'" />
  <SettingsView v-else @back="screen = 'start'" />
</template>
