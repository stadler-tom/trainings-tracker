<script setup lang="ts">
// PC analysis (requirements spec "PC-Auswertung (Subpage)"): read-only, opened from a bookmark.
// Five pages and a handful of states: a simple switch is enough, no router needed.
import { computed, onMounted, ref } from 'vue';
import { errorMessage, getAnalysis } from '../api';
import { loadSettings, parseSetupLink, saveSettings, type Settings } from '../storage';
import { exerciseStats, type AnalysisData, type ExerciseStats } from './analysis';
import { loadThemeId, saveThemeId, themeStyle, THEMES } from './themes';
import OverviewPage from './OverviewPage.vue';
import ExercisePage from './ExercisePage.vue';
import VolumePage from './VolumePage.vue';
import BodyPage from './BodyPage.vue';
import RecapPage from './RecapPage.vue';
import SetupPage from './SetupPage.vue';

type Page = 'overview' | 'recap' | 'exercise' | 'volume' | 'body';
const PAGES: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'recap', label: 'Recap' },
  { id: 'exercise', label: 'Übung' },
  { id: 'volume', label: 'Volumen' },
  { id: 'body', label: 'Körper' },
];

const page = ref<Page>('overview');
const selectedExercise = ref<string | null>(null);
const settings = ref<Settings>(takeSetupLink());
const data = ref<AnalysisData | null>(null);
const loadedAt = ref('');
const loading = ref(false);
const error = ref('');
const themeId = ref(loadThemeId());

/**
 * The bookmark carries #api=…&key=…: store it in this browser and remove it from the address bar,
 * so it is not shown or copied by accident. The bookmark itself keeps the link.
 */
function takeSetupLink(): Settings {
  const current = loadSettings();
  const link = parseSetupLink(window.location.href);
  if (!link) return current;
  const next = { ...current, ...link };
  saveSettings(next);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return next;
}

const configured = computed(() => Boolean(settings.value.apiUrl && settings.value.apiKey));
const theme = computed(() => THEMES.find((t) => t.id === themeId.value) ?? THEMES[0]);

// statistics per exercise, computed once per load and shared by all pages
const stats = computed(() => {
  const map = new Map<string, ExerciseStats>();
  if (!data.value) return map;
  for (const exercise of data.value.exercises) map.set(exercise.id, exerciseStats(exercise, data.value.log, data.value.body));
  return map;
});
const trainingTotal = computed(() => new Set((data.value?.log ?? []).map((r) => `${r[0]}|${r[1]}`)).size);

async function load() {
  if (!configured.value) return;
  loading.value = true;
  error.value = '';
  try {
    data.value = await getAnalysis(settings.value);
    loadedAt.value = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

function chooseTheme(id: string) {
  themeId.value = id;
  saveThemeId(id);
}

function openExercise(id: string) {
  selectedExercise.value = id;
  page.value = 'exercise';
  window.scrollTo(0, 0);
}

function connected(next: Settings) {
  settings.value = next;
  load();
}

onMounted(load);
</script>

<template>
  <div class="a-root" :style="themeStyle(theme)">
    <nav class="a-nav" aria-label="Bereiche">
      <div class="a-brand">Trainings-Auswertung</div>
      <template v-if="configured">
        <button
          v-for="p in PAGES"
          :key="p.id"
          type="button"
          class="a-nav-link"
          :aria-current="page === p.id ? 'page' : undefined"
          @click="page = p.id"
        >{{ p.label }}</button>
        <div class="a-meta">
          <template v-if="loading">Lädt …</template>
          <template v-else-if="data">Stand {{ loadedAt }}<br />{{ trainingTotal }} Trainings im Log</template>
        </div>
        <button type="button" class="a-small-button" :disabled="loading" @click="load">Neu laden</button>
      </template>
      <div class="a-themes">
        <div id="theme-label" class="a-label">Farbschema</div>
        <div role="group" aria-labelledby="theme-label" style="display: flex; flex-direction: column; gap: 4px">
          <button
            v-for="t in THEMES"
            :key="t.id"
            type="button"
            class="a-theme"
            :aria-pressed="t.id === themeId"
            @click="chooseTheme(t.id)"
          >
            <span style="display: flex">
              <span class="a-dot" :style="{ background: t.accent }"></span>
              <span class="a-dot" :style="{ background: t.record, marginLeft: '-4px' }"></span>
            </span>
            {{ t.name }}
          </button>
        </div>
      </div>
    </nav>

    <main class="a-main">
      <SetupPage v-if="!configured" @connected="connected" />
      <template v-else>
        <p v-if="error" class="a-error" role="alert">{{ error }}</p>
        <p v-if="loading && !data" class="a-muted">Daten werden aus dem Sheet geladen …</p>
        <template v-if="data">
          <OverviewPage v-if="page === 'overview'" :data="data" :stats="stats" @open="openExercise" />
          <RecapPage v-else-if="page === 'recap'" :data="data" :stats="stats" @open="openExercise" />
          <ExercisePage v-else-if="page === 'exercise'" v-model:selected="selectedExercise" :data="data" :stats="stats" />
          <VolumePage v-else-if="page === 'volume'" :data="data" />
          <BodyPage v-else :data="data" :stats="stats" />
        </template>
      </template>
    </main>
  </div>
</template>
