<script setup lang="ts">
// Training input (requirements spec sections 4.2–4.8).
import { computed, nextTick, ref } from 'vue';
import { errorMessage, isOlderVersion, saveTraining, SUPERSET_DROP_VERSION, updateDaySlots, updateExerciseNote, type Exercise, type State } from '../api';
import { deloadStatus } from '../deload';
import { buildPayload, MAX_EXERCISES, newDraft, newItem, parseKg, type Draft, type InvalidField } from '../draft';
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
  today: string;                                // yyyy-MM-dd, follows midnight
}>();
const emit = defineEmits<{ back: []; discard: []; saved: [draft: Draft] }>();

const message = ref('');
const messageIsError = ref(false);
const saving = ref(false);
// messages of the save button are shown right above it (where the user looks when saving)
const saveMessage = ref('');
const saveIsError = ref(false);
const summary = ref<Summary | null>(null);     // shown after a successful save
// input marked after a failed check: the date, or a field of one exercise
const invalid = ref<{ itemIndex: number | null; field: InvalidField } | null>(null);
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

// supersets and drop sets need script 1.10.0; with an older script the app hides them
const extras = computed(() => props.state != null && !isOlderVersion(props.state.apiVersion, SUPERSET_DROP_VERSION));

/** Exercises in blocks: a superset joins an exercise with the next ones as long as they are linked. */
const blocks = computed(() => {
  const result: { start: number; indexes: number[] }[] = [];
  props.draft.items.forEach((item, index) => {
    const previous = index > 0 ? props.draft.items[index - 1] : null;
    if (previous?.superset && result.length) result[result.length - 1].indexes.push(index);
    else result.push({ start: index, indexes: [index] });
  });
  return result;
});
const LETTERS = 'ABCDEFGHIJKLMNO';

/** Next set in each superset, alternating A1 → B1 → A2 → B2 …: item index -> set index. */
const nextSets = computed(() => {
  const next: Record<number, number> = {};
  for (const block of blocks.value) {
    if (block.indexes.length < 2) continue;
    const rounds = Math.max(...block.indexes.map((i) => props.draft.items[i].reps.length));
    search: for (let set = 0; set < rounds; set++) {
      for (const i of block.indexes) {
        const item = props.draft.items[i];
        if (!item.test && set < item.reps.length && item.reps[set].trim() === '') {
          next[i] = set;
          break search;
        }
      }
    }
  }
  return next;
});

/** Links an exercise with the next one as a superset, or splits them; written to the day sheet like the order. */
function toggleLink(index: number) {
  const item = props.draft.items[index];
  item.superset = !item.superset;
  touch();
  syncSlots();
}

function touch() {
  props.draft.touched = true;
  if (!messageIsError.value) message.value = '';
  if (!saveIsError.value) saveMessage.value = '';
}

/** A new date re-evaluates whether a deload is due, unless "Deload" was set by hand. */
function dateChanged() {
  if (invalid.value?.field === 'date') {
    invalid.value = null;
    saveMessage.value = '';
  }
  if (!props.draft.deloadChosen && props.state && /^\d{4}-\d{2}-\d{2}$/.test(props.draft.date)) {
    props.draft.deload = deloadStatus(props.state, props.draft.date).kind !== 'none';
  }
  touch();
}

function deloadChanged() {
  props.draft.deloadChosen = true;
  touch();
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
  if (target.field === 'date') {
    const dateInput = document.querySelector<HTMLInputElement>('.head .date input');
    dateInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    dateInput?.focus({ preventScroll: true });
    return;
  }
  const card = document.getElementById(`exercise-${target.itemIndex}`);
  const field = target.field;
  const selector = field === 'kg' ? '.kg input'
    : typeof field === 'string' && field.startsWith('drop-kg-') ? `.drop:nth-child(${Number(field.slice(8)) + 1}) .drop-kg input`
    : typeof field === 'string' && field.startsWith('drop-') ? `.drop:nth-child(${Number(field.slice(5)) + 1}) .drop-reps input`
    : typeof field === 'string' ? `.set:nth-child(${Number(field.slice(3)) + 1}) .set-kg input`
    : `.set:nth-child(${field + 1}) > input`;
  const input = card?.querySelector<HTMLInputElement>(selector);
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
  const items = props.draft.items;
  const ids = items.map((i) => i.id);
  const supersets = items.filter((i, index) => i.superset && index < items.length - 1).map((i) => i.id);
  const day = props.state?.days.find((d) => d.name === props.draft.day);
  if (day) {
    day.exerciseIds = [...ids];
    day.slots = items.map((i, index) => ({ id: i.id, sets: i.reps.length, superset: i.superset === true && index < items.length - 1 }));
  }
  slotQueue = slotQueue
    .then(() => updateDaySlots(props.settings, props.draft.day, ids, supersets))
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
const toolsKg = computed(() => {
  if (toolsFor.value === null) return null;
  const item = props.draft.items[toolsFor.value];
  return parseKg(props.draft.perSet && !item.test ? item.kgs?.[0] ?? '' : item.kg);   // per set: the weight of set 1
});
const toolsTargetKg = computed(() => {
  const exercise = toolsExercise.value;
  if (!exercise || !props.state) return null;
  return targetToday(exercise, props.state.history[exercise.id], props.draft.deload).kg;
});

// ----- save (section 4.3) -----
async function save() {
  const result = buildPayload(props.draft);
  if ('error' in result) {
    invalid.value = result.field !== undefined ? { itemIndex: result.itemIndex ?? null, field: result.field } : null;
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
        <label class="date" :class="{ invalid: invalid?.field === 'date' }">Datum
          <input v-model="draft.date" type="date" required :max="today" @change="dateChanged" />
        </label>
        <label class="check">
          <input v-model="draft.deload" type="checkbox" @change="deloadChanged" />
          Deload
        </label>
      </div>
      <label>Notiz zum Training
        <input v-model="draft.note" type="text" placeholder="optional" enterkeyhint="done" @input="touch" />
      </label>
    </section>

    <LoadingSpinner v-if="!state" label="Lade Übungen und letzte Werte …" />

    <div v-for="block in blocks" :key="draft.items[block.start].id" :class="block.indexes.length > 1 ? 'superset' : 'single'">
      <p v-if="block.indexes.length > 1" class="superset-head">
        🔗 Supersatz · abwechselnd {{ block.indexes.map((_, k) => LETTERS[k]).join(' → ') }}
      </p>
      <ExerciseCard
        v-for="(index, position) in block.indexes"
        :id="`exercise-${index}`"
        :key="draft.items[index].id"
        :item="draft.items[index]"
        :invalid-field="invalid?.itemIndex === index && invalid.field !== 'date' ? invalid.field : null"
        :exercise="exercisesById[draft.items[index].id]"
        :history="state?.history[draft.items[index].id]"
        :deload="draft.deload"
        :per-set="draft.perSet === true"
        :is-first="index === 0"
        :is-last="index === draft.items.length - 1"
        :letter="block.indexes.length > 1 ? LETTERS[position] : undefined"
        :next-set="nextSets[index] ?? null"
        :extras="extras"
        @changed="itemChanged(index)"
        @move="moveExercise(index, $event)"
        @remove="removeExercise(index)"
        @save-note="saveNote(draft.items[index].id, $event)"
        @show-tools="toolsFor = index"
        @toggle-link="toggleLink(index)"
      />
    </div>

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
      <button v-if="invalid" class="link" @click="goToInvalid">{{ invalid.field === 'date' ? 'Zum Datum' : 'Zur Übung' }}</button>
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
.date.invalid input { border-color: var(--error); border-width: 2px; }
.check { flex-direction: row; align-items: center; gap: 10px; min-height: 44px; color: var(--text); font-size: 1rem; }
.check input { width: 24px; height: 24px; min-height: 0; }
select { font: inherit; font-size: 16px; min-height: 44px; border-radius: 10px; padding: 0 8px; color: var(--text); background: var(--bg); }
.save { text-align: center; }
.single { display: contents; }
.superset { display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 10px 14px; border: 2px solid var(--today);
  border-left-width: 6px; border-radius: 16px; }
.superset-head { margin: 0; font-weight: 600; color: var(--today); }
.link { display: block; margin-top: 6px; padding: 0; min-height: 44px; background: none; border: none;
  color: inherit; font: inherit; font-weight: 600; text-decoration: underline; text-align: left; }
</style>
