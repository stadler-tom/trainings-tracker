<script setup lang="ts">
import { onMounted, ref } from 'vue';
import StartView from './views/StartView.vue';
import TrainingView from './views/TrainingView.vue';
import SettingsView from './views/SettingsView.vue';
import { errorMessage, getState, type State } from './api';
import { loadSettings, parseSetupLink, saveSettings, type Settings } from './storage';

// Three screens are enough for a simple switch; no router needed.
type Screen = 'start' | 'training' | 'settings';
const screen = ref<Screen>('start');
const selectedDay = ref<string | null>(null);
const settings = ref<Settings>(loadSettings());
const state = ref<State | null>(null);
const loading = ref(false);
const loadError = ref('');

async function reload() {
  if (!settings.value.apiUrl || !settings.value.apiKey) {
    state.value = null;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    state.value = await getState(settings.value);
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

function openDay(day: string) {
  selectedDay.value = day;
  screen.value = 'training';
}

function applySettings(updated: Settings) {
  settings.value = updated;
  saveSettings(updated);
  screen.value = 'start';
  reload();
}

onMounted(() => {
  // a setup link opened directly in the browser (works outside iOS home screen apps)
  const fromLink = parseSetupLink(location.href);
  if (fromLink) {
    applySettings({ ...settings.value, ...fromLink });
    history.replaceState(null, '', location.pathname);
    return;
  }
  reload();
});
</script>

<template>
  <StartView
    v-if="screen === 'start'"
    :configured="Boolean(settings.apiUrl && settings.apiKey)"
    :state="state"
    :loading="loading"
    :error="loadError"
    @open-day="openDay"
    @open-settings="screen = 'settings'"
    @reload="reload"
  />
  <TrainingView v-else-if="screen === 'training'" :day="selectedDay" @back="screen = 'start'" />
  <SettingsView v-else :settings="settings" :api-version="state?.apiVersion ?? null" @save="applySettings" @back="screen = 'start'" />
</template>
