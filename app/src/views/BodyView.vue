<script setup lang="ts">
// Body values (API 1.6.0+): enter weight and waist, see the weekly evaluation and the curve.
import { computed, ref, watch } from 'vue';
import { errorMessage, saveBody, type State } from '../api';
import { signedKg, waistTrend, weightCheck } from '../body';
import { parseKg, todayIso } from '../draft';
import { formatIsoDate } from '../format';
import type { Settings } from '../storage';
import { formatNumber } from '../training';
import WeightChart from './WeightChart.vue';

const props = defineProps<{
  state: State | null;
  settings: Settings;
  applyState: (state: State) => void;
}>();
const emit = defineEmits<{ back: [] }>();

const today = todayIso();
const date = ref(today);
const weight = ref('');
const waist = ref('');
const saving = ref(false);
const message = ref('');
const messageIsError = ref(false);

const body = computed(() => props.state?.body ?? []);
const target = computed(() => props.state?.weightTarget);
const check = computed(() => weightCheck(body.value, target.value, today));
const waistInfo = computed(() => waistTrend(body.value));

// values already saved for the chosen day are shown for correction
watch([date, body], () => {
  const entry = body.value.find((b) => b.date === date.value);
  weight.value = entry?.weight != null ? formatNumber(entry.weight) : '';
  waist.value = entry?.waist != null ? formatNumber(entry.waist) : '';
}, { immediate: true });

async function save() {
  const kg = parseKg(weight.value);
  const cm = parseKg(waist.value);
  if (kg === null && cm === null) {
    showMessage('Bitte Gewicht oder Bauchumfang eintragen.', true);
    return;
  }
  saving.value = true;
  message.value = '';
  try {
    const result = await saveBody(props.settings, date.value, kg, cm);
    if (props.state) props.applyState({ ...props.state, body: result.body });
    showMessage('Gespeichert ✓', false);
  } catch (error) {
    showMessage(errorMessage(error), true);
  } finally {
    saving.value = false;
  }
}

/** One decimal, German format. */
function one(value: number): string {
  return formatNumber(Math.round(value * 10) / 10);
}

function showMessage(text: string, isError: boolean) {
  message.value = text;
  messageIsError.value = isError;
}

/** "−0,5 kg pro Woche" etc. */
const targetText = computed(() => {
  const t = target.value ?? -0.5;
  return t === 0 ? 'Gewicht halten' : `${signedKg(t)} pro Woche`;
});
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Start</button>
      <h1>Körper</h1>
    </header>

    <section class="card">
      <div class="row">
        <label class="date">Datum
          <input v-model="date" type="date" :max="today" />
        </label>
      </div>
      <div class="row">
        <label>Gewicht
          <span class="unit"><input v-model="weight" type="text" inputmode="decimal" placeholder="z. B. 94,8" autocomplete="off" /> kg</span>
        </label>
        <label>Bauchumfang
          <span class="unit"><input v-model="waist" type="text" inputmode="decimal" placeholder="optional" autocomplete="off" /> cm</span>
        </label>
      </div>
      <p class="muted small">Gewicht täglich morgens nüchtern, Bauchumfang einmal pro Woche auf Nabelhöhe.</p>
      <p v-if="message" class="message" :class="messageIsError ? 'error' : 'success'" role="status">{{ message }}</p>
      <button class="primary big" :disabled="saving" @click="save">{{ saving ? 'Speichere …' : 'Speichern' }}</button>
    </section>

    <section class="card">
      <h2>Auswertung</h2>
      <template v-if="check">
        <div class="status" :class="check.status">
          <strong>{{ check.text }}</strong>
          <span>
            Wochenschnitt {{ one(check.week.average) }} kg ·
            vor 2 Wochen {{ one(check.compare.average) }} kg
          </span>
          <span>Veränderung <strong>{{ signedKg(check.change) }}</strong> · Ziel {{ signedKg(check.expected) }}</span>
        </div>
        <p v-if="check.advice" class="advice">{{ check.advice }}</p>
      </template>
      <p v-else class="muted">
        Für die Auswertung braucht es mindestens 3 Wiegungen pro Woche, und das über 3 Wochen.
      </p>
      <p class="muted small">
        Ziel: {{ targetText }} (im Sheet unter „Einstellungen“). Tageswerte schwanken durch Wasser und Essen
        um 1–2 kg, deshalb zählt nur der Wochenschnitt im Vergleich zu dem von vor 2 Wochen.
      </p>
      <WeightChart :body="body" :today="today" />
      <p v-if="waistInfo" class="waist">
        Bauchumfang <strong>{{ one(waistInfo.latest) }} cm</strong>
        <span class="muted">
          ({{ formatIsoDate(waistInfo.date) }}<template v-if="waistInfo.change !== null">, {{ signedKg(waistInfo.change, 'cm') }} in ca. 4 Wochen</template>)
        </span>
      </p>
    </section>
  </main>
</template>

<style scoped>
.row { display: flex; gap: 12px; }
.row > label { flex: 1; min-width: 0; }
.date input { width: 100%; }
.unit { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.unit input { width: 100%; text-align: center; font-weight: 600; }
.card h2 { margin: 0; }
.status {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  border-left: 4px solid var(--muted);
  background: var(--surface);
}
.status.onTrack { border-color: var(--done); background: color-mix(in srgb, var(--done) 12%, transparent); }
.status.tooSlow, .status.tooFast { border-color: #d97706; background: color-mix(in srgb, #d97706 14%, transparent); }
.advice { margin: 0; font-weight: 600; }
.waist { margin: 0; }
</style>
