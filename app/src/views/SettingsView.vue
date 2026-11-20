<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  errorMessage, isOlderVersion, loadTimings, MIN_API_VERSION, ping, updateSettings, UPDATE_GUIDE_URL,
  type GlobalSetting, type State,
} from '../api';
import { formatNumber } from '../training';
import {
  applyDarkMode, DEFAULT_PLATES, loadCodeImage, loadCodeUnlocked, loadDarkMode, parseSetupLink, saveCodeImage,
  saveCodeUnlocked, type Settings,
} from '../storage';

const props = defineProps<{ settings: Settings; apiVersion: string | null; state: State | null }>();
const emit = defineEmits<{ save: [settings: Settings]; back: []; stateUpdated: [state: State] }>();

// dark mode: per device, switches at once
const dark = ref(loadDarkMode());
watch(dark, (value) => applyDarkMode(value, true));

// hidden personal code image: unlocked by tapping the version line five times
const UNLOCK_TAPS = 5;
const codeUnlocked = ref(loadCodeUnlocked());
const codeImage = ref(loadCodeImage() ?? undefined);
const codeMessage = ref('');
const codeFailed = ref(false);
let versionTaps = 0;
function tapVersion() {
  if (codeUnlocked.value || ++versionTaps < UNLOCK_TAPS) return;
  codeUnlocked.value = true;
  saveCodeUnlocked();
}

// keeps the image small enough for the device storage; QR codes stay sharp at this size
const CODE_MAX_SIDE = 1000;
const CODE_MAX_CHARS = 2_000_000;

async function pickCodeImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  codeFailed.value = false;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CODE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > CODE_MAX_CHARS) dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (!saveCodeImage(dataUrl)) throw new Error('storage');
    codeImage.value = dataUrl;
    codeMessage.value = 'Gespeichert. Der Knopf erscheint unten auf der Startseite.';
  } catch {
    codeFailed.value = true;
    codeMessage.value = 'Das Bild konnte nicht gespeichert werden. Bitte ein anderes Bild versuchen.';
  }
}

function removeCodeImage() {
  saveCodeImage(null);
  codeImage.value = undefined;
  codeFailed.value = false;
  codeMessage.value = 'Bild entfernt.';
}

// global settings: the rows of sheet "Einstellungen", the same on every device
const globals = computed<GlobalSetting[]>(() => props.state?.settings ?? []);
const isSwitch = (s: GlobalSetting) => s.options?.length === 2 && s.options.includes('ja') && s.options.includes('nein');
const globalInputs = ref<Record<string, string | boolean>>({});
const globalsDirty = ref(false);
function resetGlobals() {
  globalInputs.value = Object.fromEntries(globals.value.map((s) => [s.key,
    isSwitch(s) ? s.value === 'ja' : typeof s.value === 'number' ? formatNumber(s.value) : String(s.value)]));
  globalsDirty.value = false;
}
watch(globals, () => { if (!globalsDirty.value) resetGlobals(); }, { immediate: true });
const globalsSaving = ref(false);
const globalsMessage = ref('');
const globalsFailed = ref(false);

/** Checks the inputs against the limits from the sheet; returns the values or an error text. */
function globalValues(): Record<string, number | string> | string {
  const values: Record<string, number | string> = {};
  for (const s of globals.value) {
    const input = globalInputs.value[s.key];
    if (isSwitch(s)) { values[s.key] = input ? 'ja' : 'nein'; continue; }
    if (s.options) { values[s.key] = String(input); continue; }
    const value = Number(String(input).trim().replace(',', '.').replace('−', '-'));
    if (String(input).trim() === '' || !Number.isFinite(value) || value < (s.min ?? -Infinity) || value > (s.max ?? Infinity)) {
      return `„${s.label}“: bitte eine Zahl von ${formatNumber(s.min ?? 0)} bis ${formatNumber(s.max ?? 0)} eintragen.`;
    }
    values[s.key] = value;
  }
  return values;
}

async function saveGlobals() {
  const values = globalValues();
  globalsFailed.value = typeof values === 'string';
  if (typeof values === 'string') { globalsMessage.value = values; return; }
  globalsSaving.value = true;
  globalsMessage.value = '';
  try {
    const result = await updateSettings(props.settings, values);
    globalsDirty.value = false;
    emit('stateUpdated', result.state);
    globalsMessage.value = 'Im Sheet gespeichert. Gilt auf allen Geräten.';
  } catch (error) {
    globalsFailed.value = true;
    globalsMessage.value = errorMessage(error);
  } finally {
    globalsSaving.value = false;
  }
}

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

    <section class="card">
      <h2>Darstellung</h2>
      <label class="switch-row">
        Dunkelmodus
        <input v-model="dark" type="checkbox" class="switch" role="switch" />
      </label>
      <p class="muted small">Gilt nur auf diesem Gerät und sofort.</p>
    </section>

    <section v-if="codeUnlocked" class="card">
      <h2>Mein Code</h2>
      <p class="muted small">Ein Bild, z. B. ein Screenshot deines QR-Codes. Es bleibt nur auf diesem Gerät.</p>
      <img v-if="codeImage" :src="codeImage" alt="Hinterlegter Code" class="code-preview" />
      <label class="file-button">
        {{ codeImage ? 'Anderes Bild wählen' : 'Bild wählen' }}
        <input type="file" accept="image/*" @change="pickCodeImage" />
      </label>
      <button v-if="codeImage" @click="removeCodeImage">Bild entfernen</button>
      <p v-if="codeMessage" class="message" :class="{ error: codeFailed, success: !codeFailed }">{{ codeMessage }}</p>
    </section>

    <button class="big primary" @click="emit('save', current())">Speichern</button>

    <section class="card">
      <h2>Globale Einstellungen</h2>
      <p class="muted small">Aus dem Blatt „Einstellungen“ in deinem Sheet. Sie gelten auf allen Geräten und für die PC-Auswertung.</p>
      <template v-if="globals.length">
        <div v-for="s in globals" :key="s.key" class="global">
          <label v-if="isSwitch(s)" class="switch-row">
            {{ s.label }}
            <input v-model="globalInputs[s.key]" type="checkbox" class="switch" role="switch" @change="globalsDirty = true" />
          </label>
          <label v-else-if="s.options">{{ s.label }}
            <select v-model="globalInputs[s.key]" @change="globalsDirty = true">
              <option v-for="o in s.options" :key="o" :value="o">{{ o }}</option>
            </select>
          </label>
          <label v-else>{{ s.label }}
            <input v-model="globalInputs[s.key]" type="text" inputmode="decimal" autocomplete="off" @input="globalsDirty = true" />
          </label>
          <p class="muted small">{{ s.help }}</p>
        </div>
        <button :disabled="globalsSaving || !globalsDirty" @click="saveGlobals">
          {{ globalsSaving ? 'Speichere …' : 'Globale Einstellungen speichern' }}
        </button>
        <p v-if="globalsMessage" class="message" :class="{ error: globalsFailed, success: !globalsFailed }">{{ globalsMessage }}</p>
      </template>
      <p v-else-if="state" class="muted">Dafür braucht es Script-Version 1.9.0 im Sheet.
        <a :href="UPDATE_GUIDE_URL" target="_blank" rel="noopener">Anleitung zum Aktualisieren</a></p>
      <p v-else class="muted">Erst die Verbindung einrichten, dann erscheinen hier die Einstellungen aus dem Sheet.</p>
    </section>

    <p class="muted small" @click="tapVersion">
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

<style scoped>
.global { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--bg); }
.global p { margin: 0; }
.code-preview { max-width: 160px; align-self: center; border-radius: 8px; background: #fff; }
.file-button {
  min-height: 44px;
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-size: 1rem;
  align-items: center;
  justify-content: center;
}
.file-button { position: relative; overflow: hidden; }
.file-button input { position: absolute; inset: 0; opacity: 0; }
</style>
