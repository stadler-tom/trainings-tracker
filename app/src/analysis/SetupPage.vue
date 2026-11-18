<script setup lang="ts">
// Shown while this browser has no web API address and key yet.
import { ref } from 'vue';
import { loadSettings, parseSetupLink, saveSettings, type Settings } from '../storage';

const emit = defineEmits<{ connected: [settings: Settings] }>();
const link = ref('');
const error = ref('');

function connect() {
  const parsed = parseSetupLink(link.value.trim());
  if (!parsed) {
    error.value = 'Das ist kein Einrichtungslink. Er enthält „#api=“ und „&key=“.';
    return;
  }
  const next = { ...loadSettings(), ...parsed };
  saveSettings(next);
  link.value = '';
  emit('connected', next);
}
</script>

<template>
  <h1>Einrichtung</h1>
  <section class="a-card">
    <p style="margin: 0">Diese Seite liest deine Trainingsdaten direkt aus deinem Tracker-Sheet. Dafür braucht sie einmal den Link für die PC-Auswertung.</p>
    <ol style="margin: 0; padding-left: 20px; line-height: 1.6">
      <li>Im Tracker-Sheet: Erweiterungen → Apps Script → Funktion <strong>showSetupLink</strong> ausführen.</li>
      <li>Den zweiten Link („PC-Auswertung“) kopieren.</li>
      <li>Als <strong>Lesezeichen</strong> anlegen und öffnen. Mit synchronisierten Lesezeichen geht es dann auf jedem PC.</li>
    </ol>
    <p class="a-note">Der Link enthält deinen Schlüssel. Er wird nur in diesem Browser gespeichert und nicht weitergegeben.</p>
  </section>
  <section class="a-card">
    <label class="a-field">
      <span class="a-label">Oder den Link hier einfügen</span>
      <input v-model="link" type="url" autocomplete="off" placeholder="https://…/auswertung/#api=…&key=…"
        style="min-height: 44px; padding: 0 12px; border: 1px solid var(--a-line2); border-radius: 10px" @keyup.enter="connect" />
    </label>
    <p v-if="error" class="a-error" role="alert">{{ error }}</p>
    <div><button type="button" class="a-small-button" style="margin: 0; padding: 0 18px" @click="connect">Verbinden</button></div>
  </section>
</template>
