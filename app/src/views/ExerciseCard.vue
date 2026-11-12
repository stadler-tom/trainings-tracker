<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Exercise, ExerciseHistory } from '../api';
import { parseKg, type DraftItem } from '../draft';
import { randomRecordPicture } from '../recordPictures';
import { checkRecord, formatNumber, lastText, stepValue, targetToday } from '../training';
import RecordBanner from './RecordBanner.vue';

const props = defineProps<{
  item: DraftItem;
  exercise: Exercise | undefined;
  history: ExerciseHistory | undefined;
  deload: boolean;
  isFirst: boolean;
  isLast: boolean;
}>();
const emit = defineEmits<{ changed: []; move: [direction: -1 | 1]; remove: []; saveNote: [note: string]; showTools: [] }>();

const target = computed(() => (props.exercise ? targetToday(props.exercise, props.history, props.deload) : null));
const last = computed(() => lastText(props.history));
const repsPlaceholder = computed(() => (target.value?.reps ? String(target.value.reps) : ''));
const increment = computed(() => props.exercise?.increment ?? 0);
const hasTools = computed(() =>
  props.exercise != null && (props.exercise.barWeight != null || props.exercise.type === 'Grundübung'));

// best record among the entered sets (section 4.5)
const record = computed(() => {
  const kg = parseKg(props.item.kg);
  if (!props.exercise || kg === null) return null;
  let best: { text: string; kind: string | null; reps: number } | null = null;
  for (const text of props.item.reps) {
    const reps = Number(text);
    if (!Number.isInteger(reps) || reps <= 0) continue;
    const result = checkRecord(props.exercise, props.history, kg, reps, props.deload);
    if (result.isRecord && (!best || reps > best.reps)) best = { text: result.text, kind: result.kind, reps };
  }
  return best;
});

// chosen once per card, so the picture does not change while typing (section 11)
const recordPicture = randomRecordPicture();

function stepKg(direction: 1 | -1) {
  props.item.kg = formatNumber(stepValue(parseKg(props.item.kg), increment.value, direction));
  emit('changed');
}

function stepReps(index: number, direction: 1 | -1) {
  const current = props.item.reps[index].trim();
  if (current === '') {
    // empty field: + takes over the goal shown as placeholder, − one below it
    const goal = target.value?.reps ?? 0;
    props.item.reps[index] = String(direction === 1 ? Math.max(goal, 1) : Math.max(goal - 1, 0));
  } else {
    props.item.reps[index] = String(stepValue(Number(current) || 0, 1, direction));
  }
  if (props.item.reps[index] === '0') props.item.reps[index] = '';
  emit('changed');
}

/** Marks the old value so typing replaces it (section 4.2). */
function selectAll(event: FocusEvent) {
  const input = event.target as HTMLInputElement;
  setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
}

const editingNote = ref(false);
const noteText = ref('');
function startNote() {
  noteText.value = props.exercise?.note ?? '';
  editingNote.value = true;
}
function finishNote() {
  if (!editingNote.value) return;
  editingNote.value = false;
  if (noteText.value.trim() !== (props.exercise?.note ?? '')) emit('saveNote', noteText.value.trim());
}
</script>

<template>
  <section class="card exercise">
    <div class="title">
      <h2>{{ exercise?.name ?? item.name }}</h2>
      <div class="order">
        <button aria-label="Nach oben" :disabled="isFirst" @click="emit('move', -1)">↑</button>
        <button aria-label="Nach unten" :disabled="isLast" @click="emit('move', 1)">↓</button>
        <button aria-label="Entfernen" @click="emit('remove')">✕</button>
      </div>
    </div>

    <template v-if="exercise">
      <input
        v-if="editingNote"
        v-model="noteText"
        class="note-input"
        placeholder="z. B. Sitz 4, Lehne 2"
        enterkeyhint="done"
        autofocus
        @blur="finishNote"
        @keyup.enter="($event.target as HTMLInputElement).blur()"
      />
      <button v-else class="note" @click="startNote">{{ exercise.note || '+ Gerätenotiz' }}</button>
    </template>
    <p v-else class="message error">Diese Übung fehlt im Übungsstamm des Sheets.</p>

    <p v-if="last" class="muted small">{{ last }}</p>
    <p v-if="target && target.text" class="target">Ziel heute: <strong>{{ target.text }}</strong></p>

    <div class="weight">
      <button v-if="increment > 0" class="step" aria-label="Gewicht weniger" @click="stepKg(-1)">−</button>
      <label class="kg">
        <input
          v-model="item.kg"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="kg"
          @focus="selectAll"
          @input="emit('changed')"
        />
        <span>kg</span>
      </label>
      <button v-if="increment > 0" class="step" aria-label="Gewicht mehr" @click="stepKg(1)">+</button>
      <button v-if="hasTools" class="tools" @click="emit('showTools')">Scheiben &amp; Aufwärmen</button>
    </div>

    <div class="sets">
      <div v-for="(_, index) in item.reps" :key="index" class="set">
        <span class="muted small">S{{ index + 1 }}</span>
        <button class="step" :aria-label="`Satz ${index + 1} mehr`" @click="stepReps(index, 1)">+</button>
        <input
          v-model="item.reps[index]"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          :placeholder="repsPlaceholder"
          @focus="selectAll"
          @input="emit('changed')"
        />
        <button class="step" :aria-label="`Satz ${index + 1} weniger`" @click="stepReps(index, -1)">−</button>
      </div>
    </div>

    <label class="check">
      <input v-model="item.failure" type="checkbox" @change="emit('changed')" />
      Versagen im letzten Satz
    </label>

    <RecordBanner
      v-if="record"
      :text="record.text"
      :image="record.kind === 'e1rm' ? recordPicture : undefined"
    />
  </section>
</template>

<style scoped>
.title { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.title h2 { padding-top: 10px; overflow-wrap: anywhere; }
.order { display: flex; gap: 4px; flex-shrink: 0; }
.order button { width: 44px; padding: 0; }
.note { text-align: left; color: var(--muted); min-height: 44px; padding: 0 10px; font-size: 0.9rem; }
.note-input { width: 100%; }
.target { margin: 0; }
.weight { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kg { flex-direction: row; align-items: center; gap: 6px; flex: 1; min-width: 110px; }
.kg input { width: 100%; text-align: center; font-weight: 600; }
.step { width: 52px; padding: 0; font-size: 1.4rem; }
.tools { flex-basis: 100%; }
.sets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.set { display: flex; flex-direction: column; align-items: stretch; gap: 4px; text-align: center; }
.set .step { width: auto; }
.set input { width: 100%; text-align: center; padding: 0 4px; font-weight: 600; }
.check { flex-direction: row; align-items: center; gap: 10px; min-height: 44px; color: var(--text); }
.check input { width: 24px; height: 24px; min-height: 0; }
</style>
