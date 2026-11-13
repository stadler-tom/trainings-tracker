<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import StartView from './views/StartView.vue';
import TrainingView from './views/TrainingView.vue';
import SettingsView from './views/SettingsView.vue';
import HistoryView from './views/HistoryView.vue';
import BodyView from './views/BodyView.vue';
import { errorMessage, getState, type State, type TrainingDetail } from './api';
import { draftFromTraining, loadDraft, newDraft, removeDraft, saveDraft, type Draft } from './draft';
import { loadCachedState, loadSettings, parseSetupLink, saveCachedState, saveSettings, type Settings } from './storage';

// A handful of screens: a simple switch is enough, no router needed.
type Screen = 'start' | 'training' | 'settings' | 'history' | 'body';
const screen = ref<Screen>('start');
// where "back" leads from the training: the history when a saved training is corrected
const trainingReturn = ref<Screen>('start');
const settings = ref<Settings>(loadSettings());
// the last known state is shown at once; reload() replaces it with the fresh one
const state = ref<State | null>(loadCachedState<State>(settings.value.apiUrl));
const draft = ref<Draft | null>(loadDraft());
const loading = ref(false);
const loadError = ref('');

// every change of the running training is stored at once (section 4.2)
watch(draft, (current) => {
  if (current?.touched) saveDraft(current);
  else removeDraft();
}, { deep: true });

async function reload() {
  if (!settings.value.apiUrl || !settings.value.apiKey) {
    state.value = null;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    applyState(await getState(settings.value));
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

/** New state from the web API (after loading or saving); also kept for the next start. */
function applyState(fresh: State) {
  state.value = fresh;
  saveCachedState(settings.value.apiUrl, fresh);
  // a training opened before the data arrived gets its exercises now
  if (draft.value && !draft.value.touched && draft.value.items.length === 0) {
    draft.value = newDraft(fresh, draft.value.day, draft.value.date);
  }
}

function openDay(day: string) {
  const running = draft.value;
  if (running?.touched && running.day !== day &&
      !confirm(`Das ungespeicherte Training „${running.day}“ verwerfen und „${day}“ beginnen?`)) {
    return;
  }
  if (!running || running.day !== day || !running.touched) {
    draft.value = state.value
      ? newDraft(state.value, day)
      : newDraftPlaceholder(day);
  }
  trainingReturn.value = running?.replaces && running.day === day && running.touched ? 'history' : 'start';
  screen.value = 'training';
}

/** Opens a saved training from the history for correction (API 1.6.0+). */
function editTraining(detail: TrainingDetail) {
  const running = draft.value;
  if (running?.touched && !confirm(`Das ungespeicherte Training „${running.day}“ verwerfen und das Training vom ${detail.date.split('-').reverse().join('.')} bearbeiten?`)) {
    return;
  }
  draft.value = draftFromTraining(detail);
  trainingReturn.value = 'history';
  screen.value = 'training';
}

/** Training opened before the data arrived; reload() fills in the exercises. */
function newDraftPlaceholder(day: string): Draft {
  return newDraft({ apiVersion: '', days: [], exercises: [], history: {} }, day);
}

function discardTraining() {
  draft.value = null;
  screen.value = trainingReturn.value;
  trainingReturn.value = 'start';
}

function leaveTraining() {
  screen.value = trainingReturn.value;
  trainingReturn.value = 'start';
}

function applySettings(updated: Settings) {
  if (updated.apiUrl !== settings.value.apiUrl) state.value = null;   // other sheet: do not show the old data
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
  // an unsaved training continues right away (section 4.1)
  if (draft.value?.touched) {
    screen.value = 'training';
    if (draft.value.replaces) trainingReturn.value = 'history';
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
    :running-day="draft?.touched ? draft.day : null"
    @open-day="openDay"
    @open-settings="screen = 'settings'"
    @open-history="screen = 'history'"
    @open-body="screen = 'body'"
    @reload="reload"
  />
  <TrainingView
    v-else-if="screen === 'training' && draft"
    :draft="draft"
    :state="state"
    :settings="settings"
    :load-error="loadError"
    :reload="reload"
    :apply-state="applyState"
    @back="leaveTraining"
    @discard="discardTraining"
    @saved="draft = $event"
  />
  <HistoryView
    v-else-if="screen === 'history'"
    :state="state"
    :settings="settings"
    :apply-state="applyState"
    @back="screen = 'start'"
    @edit="editTraining"
  />
  <BodyView
    v-else-if="screen === 'body'"
    :state="state"
    :settings="settings"
    :apply-state="applyState"
    @back="screen = 'start'"
  />
  <SettingsView
    v-else-if="screen === 'settings'"
    :settings="settings"
    :api-version="state?.apiVersion ?? null"
    @save="applySettings"
    @back="screen = 'start'"
  />
</template>
