<script setup lang="ts">
import { computed, ref } from 'vue';
import { errorMessage, isOlderVersion, loadTimings, MIN_API_VERSION, ping, UPDATE_GUIDE_URL } from '../api';
import { formatNumber } from '../training';
import { DEFAULT_PLATES, parseSetupLink, type Settings } from '../storage';

const props = defineProps<{ settings: Settings; apiVersion: string | null }>();
const emit = defineEmits<{ save: [settings: Settings]; back: [] }>();

const apiUrl = ref(props.settings.apiUrl);
const apiKey = ref(props.settings.apiKey);
const plates = ref(props.settings.plates.join('; ').replace(/\./g, ','));
const setupLink = ref('');
const testResult = ref('');
const testFailed = ref(false);
const testing = ref(false);

const appVersion = __APP_VERSION__;
// duration of the last load and save, to check the load times on the phone
const TIMING_LABELS: Record<string, string> = { getState: 'Letztes Laden', saveTraining: 'Letztes Speichern' };
const timingLines = Object.entries(TIMING_LABELS).flatMap(([action, label]) => {
  const timing = loadTimings()[action];
  if (!timing) return [];
  const seconds = (ms: number) => formatNumber(Math.round(ms / 100) / 10);
  const script = timing.scriptMs !== null ? `, davon Script ${seconds(timing.scriptMs)} s` : '';
  return [`${label}: ${seconds(timing.totalMs)} s${script}`];
});

const apiOutdated = computed(() => props.apiVersion !== null && isOlderVersion(props.apiVersion, MIN_API_VERSION));

function applyLink() {
  const parsed = parseSetupLink(setupLink.value.trim());
  if (!parsed) {
    testFailed.value = true;
    testResult.value = 'Das ist kein gültiger Einrichtungslink.';
    return;
  }
  apiUrl.value = parsed.apiUrl;
  apiKey.value = parsed.apiKey;
  setupLink.value = '';
  testConnection();
}

function current(): Settings {
  const parsedPlates = plates.value
    .split(/[;\s]+/)
    .map((p) => Number(p.replace(',', '.')))
    .filter((p) => p > 0)
    .sort((a, b) => b - a);
  return {
    apiUrl: apiUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    plates: parsedPlates.length ? parsedPlates : DEFAULT_PLATES,
  };
}

async function testConnection() {
  testing.value = true;
  testResult.value = '';
  try {
    const result = await ping(current());
    testFailed.value = false;
    testResult.value = `Verbunden mit „${result.sheetName}“ (Web-API ${result.apiVersion}).`;
    if (isOlderVersion(result.apiVersion, MIN_API_VERSION)) {
      testResult.value += ` Bitte das Script im Sheet aktualisieren (mindestens ${MIN_API_VERSION}).`;
    }
  } catch (error) {
    testFailed.value = true;
    testResult.value = errorMessage(error);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Zurück</button>
      <h1>Einstellungen</h1>
    </header>

    <section class="card">
      <h2>Einrichtungslink</h2>
      <p class="muted">Den Link aus dem Script deines Sheets hier einfügen. Adresse und Schlüssel werden übernommen.</p>
      <input v-model="setupLink" type="url" placeholder="https://…#api=…&key=…" autocomplete="off" />
      <button @click="applyLink">Link übernehmen</button>
    </section>

    <section class="card">
      <h2>Verbindung</h2>
      <label>Web-API-Adresse<input v-model="apiUrl" type="url" placeholder="https://script.google.com/…/exec" autocomplete="off" /></label>
      <label>Schlüssel<input v-model="apiKey" type="password" autocomplete="off" /></label>
      <button :disabled="testing" @click="testConnection">{{ testing ? 'Teste …' : 'Verbindung testen' }}</button>
      <p v-if="testResult" class="message" :class="{ error: testFailed, success: !testFailed }">{{ testResult }}</p>
    </section>

    <section class="card">
      <h2>Hantelscheiben</h2>
      <label>Verfügbare Scheiben in kg, getrennt durch Semikolon<input v-model="plates" inputmode="decimal" /></label>
    </section>

    <button class="big primary" @click="emit('save', current())">Speichern</button>

    <p class="muted small">
      App {{ appVersion }} · Web-API {{ apiVersion ?? 'unbekannt' }}
    </p>
    <p v-if="timingLines.length" class="muted small">
      <template v-for="line in timingLines" :key="line">{{ line }}<br /></template>
    </p>
    <p v-if="apiOutdated" class="message error">
      Das Script in deinem Sheet ist älter als diese App braucht (mindestens {{ MIN_API_VERSION }}).
      <a :href="UPDATE_GUIDE_URL" target="_blank" rel="noopener">Anleitung zum Aktualisieren</a>
    </p>
  </main>
</template>
