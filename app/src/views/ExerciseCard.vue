<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Exercise, ExerciseHistory } from '../api';
import { signedKg } from '../body';
import { dropKg, MAX_DROPS, parseKg, type DraftItem, type InvalidField } from '../draft';
import { randomRecordPicture } from '../recordPictures';
import { checkRecord, checkTestRecord, formatNumber, lastText, perSetText, stepValue, targetPerSet, targetToday } from '../training';
import RecordBanner from './RecordBanner.vue';

const props = defineProps<{
  item: DraftItem;
  exercise: Exercise | undefined;
  history: ExerciseHistory | undefined;
  deload: boolean;
  isFirst: boolean;
  isLast: boolean;
  invalidField?: Exclude<InvalidField, 'date'> | null;   // input marked after a failed save
  perSet?: boolean;                      // mode "Gewicht pro Satz": one weight field per set (API 1.8.0+)
  letter?: string;                       // position in a superset: A, B, C
  nextSet?: number | null;               // in a superset: the set to do next in this exercise
  extras?: boolean;                      // script 1.10.0+: superset link and drop sets available
}>();
const emit = defineEmits<{ changed: []; move: [direction: -1 | 1]; remove: []; saveNote: [note: string]; showTools: []; toggleLink: [] }>();

const target = computed(() => (props.exercise ? targetToday(props.exercise, props.history, props.deload) : null));
// mode "Gewicht pro Satz": every set has its own target (double progression per set)
const setTargets = computed(() =>
  props.perSet && props.exercise ? targetPerSet(props.exercise, props.history, props.item.reps.length, props.deload) : null);
const targetText = computed(() => {
  if (props.item.test || !target.value) return '';
  if (setTargets.value && target.value.kind !== 'deload' && target.value.kind !== 'warmUp') return perSetText(setTargets.value);
  return target.value.text;
});
const last = computed(() => lastText(props.history));
function repsPlaceholder(index: number): string {
  const goal = setTargets.value?.[index]?.reps ?? target.value?.reps;
  return goal ? String(goal) : '';
}
const showWeightRow = computed(() => !props.perSet || props.item.test);
/** Weight of one set: its own field in mode "Gewicht pro Satz", else the shared one. */
function setKg(index: number): number | null {
  return props.perSet ? parseKg(props.item.kgs?.[index] ?? '') : parseKg(props.item.kg);
}
const increment = computed(() => props.exercise?.increment ?? 0);
const hasTools = computed(() =>
  props.exercise != null && (props.exercise.barWeight != null || props.exercise.type === 'Grundübung'));

// best record among the entered sets (section 4.5)
const record = computed(() => {
  if (!props.exercise || props.item.limited) return null;          // "Eingeschränkt": never a record
  if (props.item.test) {
    const kg = parseKg(props.item.kg);
    if (kg === null) return null;
    const result = checkTestRecord(props.history, kg);
    return result.isRecord ? { text: result.text, kind: result.kind, value: kg } : null;
  }
  let best: { text: string; kind: string | null; value: number } | null = null;
  props.item.reps.forEach((text, index) => {
    const reps = Number(text);
    const kg = setKg(index);
    if (!Number.isInteger(reps) || reps <= 0 || kg === null) return;
    const result = checkRecord(props.exercise as Exercise, props.history, kg, reps, props.deload);
    const value = kg * 1000 + reps;                                // heaviest set first, then more reps
    if (result.isRecord && (!best || value > best.value)) best = { text: result.text, kind: result.kind, value };
  });
  return best;
});

// e1RM of the last sessions as a small curve (API 1.6.0+ sends up to 8)
const CURVE = { width: 120, height: 30, pad: 3 };
const curve = computed(() => {
  const points = props.history?.recentE1rm ?? [];
  if (points.length < 2) return null;
  const values = points.map((p) => p.e1rm);
  const low = Math.min(...values);
  const range = Math.max(...values) - low || 1;
  const step = (CURVE.width - 2 * CURVE.pad) / (points.length - 1);
  const xy = values.map((v, i) => [
    CURVE.pad + i * step,
    CURVE.height - CURVE.pad - ((v - low) / range) * (CURVE.height - 2 * CURVE.pad),
  ]);
  const last = values[values.length - 1];
  return {
    line: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    end: xy[xy.length - 1],
    text: `e1RM ${formatNumber(Math.round(last * 10) / 10)} kg · ${signedKg(last - values[0])} in ${points.length} Einheiten`,
    rising: last >= values[0],
  };
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
    const goal = Number(repsPlaceholder(index)) || 0;
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

/** 1RM test: one attempt with 1 rep; the set fields and the failure mark are not used. */
function toggleTest() {
  if (props.item.test) {
    props.item.reps = props.item.reps.map(() => '');
    props.item.failure = false;
    props.item.drops = [];
  }
  emit('changed');
}

// ----- drop sets after the last set (API 1.10.0+) -----
const canAddDrop = computed(() => props.extras === true && !props.item.test && (props.item.drops?.length ?? 0) < MAX_DROPS);
function addDrop() {
  const drops = props.item.drops ?? (props.item.drops = []);
  drops.push({ kg: dropKg(props.item, props.perSet === true, increment.value), reps: '' });
  emit('changed');
}
function removeDrop(index: number) {
  props.item.drops?.splice(index, 1);
  emit('changed');
}

/** "Eingeschränkt" (pain, stopped early): the reason field appears; unticking clears it. */
function toggleLimited() {
  if (!props.item.limited) props.item.reason = '';
  emit('changed');
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
  <section class="card exercise" :class="{ invalid: invalidField != null }">
    <div class="title">
      <h2><span v-if="letter" class="letter">{{ letter }}</span>{{ exercise?.name ?? item.name }}</h2>
      <div class="order">
        <button v-if="extras" class="link-toggle" :class="{ on: item.superset && !isLast }" :disabled="isLast" :aria-pressed="item.superset && !isLast"
          :aria-label="item.superset ? 'Supersatz mit der nächsten Übung lösen' : 'Mit der nächsten Übung als Supersatz verbinden'"
          @click="emit('toggleLink')">🔗</button>
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
    <div v-if="curve" class="curve" :class="{ rising: curve.rising }">
      <svg :viewBox="`0 0 ${CURVE.width} ${CURVE.height}`" aria-hidden="true">
        <polyline :points="curve.line" />
        <circle :cx="curve.end[0]" :cy="curve.end[1]" r="3" />
      </svg>
      <span class="muted small">{{ curve.text }}</span>
    </div>
    <p v-if="targetText" class="target">Ziel heute: <strong>{{ targetText }}</strong></p>
    <p v-if="exercise && exercise.repsMax > 0" class="muted small">Wdh: {{ exercise.repsMin }}–{{ exercise.repsMax }}</p>

    <div v-if="showWeightRow" class="weight">
      <button v-if="increment > 0" class="step" aria-label="Gewicht weniger" @click="stepKg(-1)">−</button>
      <label class="kg" :class="{ invalid: invalidField === 'kg' }">
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

    <p v-if="item.test" class="test-hint">
      1RM-Test: ein Versuch mit 1 Wdh.<template v-if="history?.bestTest"> Bisher bestes 1RM: {{ formatNumber(history.bestTest.kg) }} kg.</template>
      Zählt nicht für Ziel, Rekorde und Progression.
    </p>

    <div v-else class="sets" :style="{ gridTemplateColumns: `repeat(${Math.max(item.reps.length, 3)}, 1fr)` }">
      <div v-for="(_, index) in item.reps" :key="index" class="set"
        :class="{ invalid: invalidField === index, 'invalid-kg': invalidField === `kg-${index}` }">
        <span class="muted small">S{{ index + 1 }}</span>
        <label v-if="perSet && item.kgs" class="set-kg">
          <input
            v-model="item.kgs[index]"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="kg"
            :aria-label="`Satz ${index + 1} Gewicht`"
            @focus="selectAll"
            @input="emit('changed')"
          />
          <span class="muted small">kg</span>
        </label>
        <button class="step" :aria-label="`Satz ${index + 1} mehr`" @click="stepReps(index, 1)">+</button>
        <input
          v-model="item.reps[index]"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          :placeholder="repsPlaceholder(index)"
          :class="{ filled: String(item.reps[index] ?? '').trim() !== '', next: nextSet === index && String(item.reps[index] ?? '').trim() === '' }"
          :aria-label="`Satz ${index + 1} Wiederholungen`"
          @focus="selectAll"
          @input="emit('changed')"
        />
        <button class="step" :aria-label="`Satz ${index + 1} weniger`" @click="stepReps(index, -1)">−</button>
      </div>
    </div>

    <div v-if="item.drops?.length && !item.test" class="drops">
      <div v-for="(drop, index) in item.drops" :key="index" class="drop"
        :class="{ invalid: invalidField === `drop-${index}`, 'invalid-kg': invalidField === `drop-kg-${index}` }">
        <span class="muted small">Drop {{ index + 1 }}</span>
        <label class="drop-kg">
          <input v-model="drop.kg" type="text" inputmode="decimal" autocomplete="off" placeholder="kg"
            :aria-label="`Drop ${index + 1} Gewicht`" @focus="selectAll" @input="emit('changed')" />
          <span class="muted small">kg</span>
        </label>
        <label class="drop-reps">
          <input v-model="drop.reps" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Wdh"
            :class="{ filled: drop.reps.trim() !== '' }" :aria-label="`Drop ${index + 1} Wiederholungen`" @focus="selectAll" @input="emit('changed')" />
          <span class="muted small">Wdh</span>
        </label>
        <button class="remove-drop" :aria-label="`Drop ${index + 1} entfernen`" @click="removeDrop(index)">✕</button>
      </div>
    </div>
    <button v-if="canAddDrop" class="add-drop" @click="addDrop">+ Drop <span class="muted small">(−20 % Gewicht)</span></button>

    <button v-if="!showWeightRow && hasTools" class="tools" @click="emit('showTools')">Scheiben &amp; Aufwärmen</button>

    <label v-if="!item.test" class="check">
      <input v-model="item.failure" type="checkbox" @change="emit('changed')" />
      Versagen im letzten Satz
    </label>
    <label v-if="!item.test" class="check">
      <input v-model="item.limited" type="checkbox" @change="toggleLimited" />
      Eingeschränkt (Schmerzen, Abbruch)
    </label>
    <label v-if="item.limited && !item.test" class="reason">Grund (optional)
      <input v-model="item.reason" type="text" maxlength="200" placeholder="z. B. Schulter links" enterkeyhint="done" @input="emit('changed')" />
    </label>
    <p v-if="item.limited && !item.test" class="muted small">Zählt nicht für Ziel, Rekorde und Progression, aber beim Volumen.</p>
    <label v-if="!item.limited" class="check">
      <input v-model="item.test" type="checkbox" @change="toggleTest" />
      1RM-Test (Maximalversuch)
    </label>

    <RecordBanner
      v-if="record"
      :text="record.text"
      :image="record.kind === 'weight' || record.kind === 'test' ? recordPicture : undefined"
    />
  </section>
</template>

<style scoped>
.exercise.invalid { outline: 2px solid var(--error); outline-offset: -2px; }
.invalid input { border-color: var(--error); border-width: 2px; }
.title { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.title h2 { padding-top: 10px; overflow-wrap: anywhere; }
.order { display: flex; gap: 4px; flex-shrink: 0; }
.order button { width: 44px; padding: 0; }
.note { text-align: left; color: var(--muted); min-height: 44px; padding: 0 10px; font-size: 0.9rem; }
.note-input { width: 100%; }
.target { margin: 0; }
.curve { display: flex; align-items: center; gap: 10px; }
.curve svg { width: 96px; height: 24px; flex-shrink: 0; overflow: visible; }
.curve polyline { fill: none; stroke: var(--muted); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.curve circle { fill: var(--muted); }
.curve.rising polyline { stroke: var(--done); }
.curve.rising circle { fill: var(--done); }
.weight { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kg { flex-direction: row; align-items: center; gap: 6px; flex: 1; min-width: 110px; }
.kg input { width: 100%; text-align: center; font-weight: 600; }
.step { width: 52px; padding: 0; font-size: 1.4rem; }
.tools { flex-basis: 100%; }
.sets { display: grid; gap: 6px; }
.set-kg { display: flex; flex-direction: column; gap: 2px; }
.set-kg input { width: 100%; text-align: center; padding: 0 4px; }
.invalid-kg .set-kg input { border-color: var(--error); border-width: 2px; }
.reason input { width: 100%; }
.set { display: flex; flex-direction: column; align-items: stretch; gap: 4px; text-align: center; }
.set .step { width: auto; }
.set input { width: 100%; text-align: center; padding: 0 4px; font-weight: 600; }
/* a tracked set: green field, so it is easy to see what is done */
.set:not(.invalid) input.filled { background: color-mix(in srgb, var(--done) 18%, var(--bg)); border-color: var(--done); }
.check { flex-direction: row; align-items: center; gap: 10px; min-height: 44px; color: var(--text); }
.check input { width: 24px; height: 24px; min-height: 0; }
.letter { display: inline-block; min-width: 1.4em; margin-right: 6px; color: var(--today); font-weight: 700; }
.order .link-toggle { font-size: 1.1rem; filter: grayscale(1); opacity: 0.6; }
.order .link-toggle.on { filter: none; opacity: 1; border-color: var(--today); background: color-mix(in srgb, var(--today) 18%, var(--bg)); }
.set input.next { border: 2px solid var(--accent); }
.drops { display: flex; flex-direction: column; gap: 6px; margin-left: 14px; padding-left: 10px; border-left: 2px solid var(--muted); }
.drop { display: flex; align-items: center; gap: 6px; }
.drop > .muted { flex-shrink: 0; }
label.drop-kg, label.drop-reps { flex-direction: row; align-items: center; gap: 4px; color: var(--text); font-size: 1rem; }
.drop-kg input { width: 64px; text-align: center; padding: 0 4px; }
.drop-reps input { width: 52px; text-align: center; padding: 0 4px; font-weight: 600; }
.drop:not(.invalid) .drop-reps input.filled { background: color-mix(in srgb, var(--done) 18%, var(--bg)); border-color: var(--done); }
.drop.invalid .drop-reps input, .drop.invalid-kg .drop-kg input { border-color: var(--error); border-width: 2px; }
.remove-drop { flex: 0 0 40px; width: 40px; padding: 0; margin-left: auto; }
.add-drop { align-self: flex-start; }
.test-hint { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--today) 14%, transparent); }
</style>
