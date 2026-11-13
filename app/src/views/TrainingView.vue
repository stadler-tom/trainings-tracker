<script setup lang="ts">
// Training input (requirements spec sections 4.2–4.8).
import { computed, nextTick, ref } from 'vue';
import { errorMessage, saveTraining, updateDaySlots, updateExerciseNote, type Exercise, type State } from '../api';
import { buildPayload, MAX_EXERCISES, newDraft, newItem, parseKg, type Draft } from '../draft';
import type { Settings } from '../storage';
import { buildSummary, type Summary } from '../summary';
import { targetToday } from '../training';
import ExerciseCard from './ExerciseCard.vue';
import LoadingSpinner from './LoadingSpinner.vue';
import SummaryOverlay from './SummaryOverlay.vue';
import ToolsOverlay from './ToolsOverlay.vue';

const props = defineProps<{
  draft: Draft;
  state: State | null;
  settings: Settings;
  loadError: string;
  reload: () => Promise<void>;
  applyState: (state: State) => void;
}>();
const emit = defineEmits<{ back: []; discard: []; saved: [draft: Draft] }>();

const message = ref('');
const messageIsError = ref(false);
const saving = ref(false);
// messages of the save button are shown right above it (where the user looks when saving)
const saveMessage = ref('');
const saveIsError = ref(false);
const summary = ref<Summary | null>(null);     // shown after a successful save
const invalid = ref<{ itemIndex: number; field: 'kg' | number } | null>(null);
const toolsFor = ref<number | null>(null);

const exercisesById = computed(() => {
  const map: Record<string, Exercise> = {};
  props.state?.exercises.forEach((e) => (map[e.id] = e));
  return map;
});

// active exercises not yet in today's training, grouped by muscle group
const addable = computed(() => {
  const used = new Set(props.draft.items.map((i) => i.id));
  const groups: Record<string, Exercise[]> = {};
  for (const exercise of props.state?.exercises ?? []) {
    if (!exercise.active || used.has(exercise.id)) continue;
    (groups[exercise.muscleGroup || 'Sonstige'] ??= []).push(exercise);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'de'));
});
const toAdd = ref('');

function touch() {
  props.draft.touched = true;
  if (!messageIsError.value) message.value = '';
  if (!saveIsError.value) saveMessage.value = '';
}

/** A change in the marked exercise clears the marking and its message. */
function itemChanged(index: number) {
  if (invalid.value?.itemIndex === index) {
    invalid.value = null;
    saveMessage.value = '';
  }
  touch();
}

function showSaveMessage(text: string, isError: boolean) {
  saveMessage.value = text;
  saveIsError.value = isError;
}

/** Scrolls to the marked exercise and puts the cursor into the input to fix. */
function goToInvalid() {
  const target = invalid.value;
  if (!target) return;
  const card = document.getElementById(`exercise-${target.itemIndex}`);
  const input = card?.querySelector<HTMLInputElement>(
    target.field === 'kg' ? '.kg input' : `.set:nth-child(${target.field + 1}) input`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}

function showMessage(text: string, isError: boolean) {
  message.value = text;
  messageIsError.value = isError;
}

// ----- exercise selection: written to the day sheet right away (section 4.2) -----
let slotQueue = Promise.resolve();
function syncSlots() {
  const ids = props.draft.items.map((i) => i.id);
  const day = props.state?.days.find((d) => d.name === props.draft.day);
  if (day) day.exerciseIds = [...ids];
  slotQueue = slotQueue
    .then(() => updateDaySlots(props.settings, props.draft.day, ids))
    .then(() => undefined)
    .catch((error) => showMessage(`Übungsauswahl nicht im Sheet gespeichert. ${errorMessage(error)}`, true));
}

function addExercise() {
  if (!toAdd.value || !props.state) return;
  if (props.draft.items.length >= MAX_EXERCISES) {
    showMessage(`Ein Trainingstag hat höchstens ${MAX_EXERCISES} Übungen.`, true);
  } else {
    props.draft.items.push(newItem(props.state, toAdd.value, props.draft.deload));
    touch();
    syncSlots();
  }
  toAdd.value = '';
}

function removeExercise(index: number) {
  const item = props.draft.items[index];
  const hasInput = item.reps.some((r) => r.trim() !== '');
  if (hasInput && !confirm(`„${item.name}“ mit den eingetragenen Sätzen entfernen?`)) return;
  props.draft.items.splice(index, 1);
  touch();
  syncSlots();
}

function moveExercise(index: number, direction: -1 | 1) {
  const items = props.draft.items;
  const other = index + direction;
  if (other < 0 || other >= items.length) return;
  [items[index], items[other]] = [items[other], items[index]];
  touch();
  syncSlots();
}

// ----- equipment note (section 4.6) -----
async function saveNote(id: string, note: string) {
  const exercise = exercisesById.value[id];
  const previous = exercise?.note ?? '';
  if (exercise) exercise.note = note;
  try {
    await updateExerciseNote(props.settings, id, note);
  } catch (error) {
    if (exercise) exercise.note = previous;
    showMessage(`Gerätenotiz nicht gespeichert. ${errorMessage(error)}`, true);
  }
}

// ----- tools overlay -----
const toolsExercise = computed(() =>
  toolsFor.value === null ? undefined : exercisesById.value[props.draft.items[toolsFor.value]?.id]);
const toolsKg = computed(() => (toolsFor.value === null ? null : parseKg(props.draft.items[toolsFor.value].kg)));
const toolsTargetKg = computed(() => {
  const exercise = toolsExercise.value;
  if (!exercise || !props.state) return null;
  return targetToday(exercise, props.state.history[exercise.id], props.draft.deload).kg;
});

// ----- save (section 4.3) -----
async function save() {
  const result = buildPayload(props.draft);
  if ('error' in result) {
    invalid.value = result.itemIndex !== undefined && result.field !== undefined
      ? { itemIndex: result.itemIndex, field: result.field } : null;
    showSaveMessage(result.error, true);
    return;
  }
  invalid.value = null;
  saving.value = true;
  saveMessage.value = '';
  const finished = buildSummary(result.payload, props.state);   // records against the trainings before this one
  let saved: Awaited<ReturnType<typeof saveTraining>>;
  try {
    saved = await saveTraining(props.settings, result.payload);
  } catch (error) {
    showSaveMessage(errorMessage(error), true);
    saving.value = false;
    return;
  }
  // "zuletzt" and "Ziel heute" must include this training: the web API (1.4.0+) sends the
  // new state with the answer; older versions need a second request
  let fresh: State | null = props.state;
  if (saved.state) {
    props.applyState(saved.state);
    fresh = saved.state;
  } else {
    await props.reload();
    await nextTick();                            // props.state follows the parent after its update
    fresh = props.state;
  }
  saving.value = false;
  if (fresh) emit('saved', newDraft(fresh, props.draft.day, props.draft.date));
  showSaveMessage(`Training gespeichert: ${result.sets} ${result.sets === 1 ? 'Satz' : 'Sätze'}.`, false);
  summary.value = finished;
}

function discard() {
  if (props.draft.touched && !confirm('Alle Eingaben dieses Trainings verwerfen?')) return;
  emit('discard');
}
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Start</button>
      <h1>{{ draft.day }}</h1>
    </header>

    <p v-if="message" class="message" :class="messageIsError ? 'error' : 'success'" role="status">{{ message }}</p>
    <p v-if="loadError" class="message error">{{ loadError }}</p>

    <section class="card head">
      <div class="row">
        <label class="date">Datum
          <input v-model="draft.date" type="date" required @change="touch" />
        </label>
        <label class="check">
          <input v-model="draft.deload" type="checkbox" @change="touch" />
          Deload
        </label>
      </div>
      <label>Notiz zum Training
        <input v-model="draft.note" type="text" placeholder="optional" enterkeyhint="done" @input="touch" />
      </label>
    </section>

    <LoadingSpinner v-if="!state" label="Lade Übungen und letzte Werte …" />

    <ExerciseCard
      v-for="(item, index) in draft.items"
      :id="`exercise-${index}`"
      :key="item.id"
      :item="item"
      :invalid-field="invalid?.itemIndex === index ? invalid.field : null"
      :exercise="exercisesById[item.id]"
      :history="state?.history[item.id]"
      :deload="draft.deload"
      :is-first="index === 0"
      :is-last="index === draft.items.length - 1"
      @changed="itemChanged(index)"
      @move="moveExercise(index, $event)"
      @remove="removeExercise(index)"
      @save-note="saveNote(item.id, $event)"
      @show-tools="toolsFor = index"
    />

    <section v-if="state" class="card">
      <label>Übung hinzufügen
        <select v-model="toAdd" @change="addExercise">
          <option value="">Übung auswählen …</option>
          <optgroup v-for="[group, exercises] in addable" :key="group" :label="group">
            <option v-for="exercise in exercises" :key="exercise.id" :value="exercise.id">{{ exercise.name }}</option>
          </optgroup>
        </select>
      </label>
    </section>

    <p v-if="saveMessage" class="message" :class="saveIsError ? 'error' : 'success'" role="alert">
      {{ saveMessage }}
      <button v-if="invalid" class="link" @click="goToInvalid">Zur Übung</button>
    </p>
    <button class="primary big save" :disabled="saving" @click="save">
      {{ saving ? 'Speichere …' : 'Training speichern' }}
    </button>
    <button class="ghost" @click="discard">Training verwerfen</button>

    <SummaryOverlay v-if="summary" :summary="summary" @close="summary = null; emit('back')" />

    <ToolsOverlay
      v-if="toolsExercise"
      :exercise="toolsExercise"
      :kg="toolsKg"
      :target-kg="toolsTargetKg"
      :plates="settings.plates"
      @close="toolsFor = null"
    />
  </main>
</template>

<style scoped>
.head .row { display: flex; gap: 12px; align-items: flex-end; }
.date { flex: 1; }
.date input { width: 100%; }
.check { flex-direction: row; align-items: center; gap: 10px; min-height: 44px; color: var(--text); font-size: 1rem; }
.check input { width: 24px; height: 24px; min-height: 0; }
select { font: inherit; font-size: 16px; min-height: 44px; border-radius: 10px; padding: 0 8px; color: var(--text); background: var(--bg); }
.save { text-align: center; }
.link { display: block; margin-top: 6px; padding: 0; min-height: 44px; background: none; border: none;
  color: inherit; font: inherit; font-weight: 600; text-decoration: underline; text-align: left; }
</style>
