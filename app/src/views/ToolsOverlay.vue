<script setup lang="ts">
// Plate calculator (section 4.7) and warm-up sets (section 4.8) as an overlay in the training.
import { computed } from 'vue';
import type { Exercise } from '../api';
import { formatNumber, platesPerSide, warmUpSets } from '../training';

const props = defineProps<{ exercise: Exercise; kg: number | null; targetKg: number | null; plates: number[] }>();
const emit = defineEmits<{ close: [] }>();

const bar = computed(() => props.exercise.barWeight);

function plateText(total: number): string {
  if (bar.value == null) return '';
  const load = platesPerSide(total, bar.value, props.plates);
  if (load.missing < 0) return `leichter als die Stange (${formatNumber(bar.value)} kg)`;
  const side = load.perSide.length ? load.perSide.map(formatNumber).join(' + ') : 'keine Scheiben';
  const exact = load.missing === 0 ? '' : ` → ${formatNumber(load.loadedTotal)} kg, ${formatNumber(load.missing)} kg fehlen`;
  return `je Seite ${side}${exact}`;
}

const warmUp = computed(() => warmUpSets(props.exercise, props.targetKg));
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="sheet card" role="dialog" aria-modal="true">
      <div class="bar">
        <h2>{{ exercise.name }}</h2>
        <button class="ghost" @click="emit('close')">Schließen</button>
      </div>

      <template v-if="bar != null">
        <h3>Scheiben</h3>
        <p v-if="kg != null">
          <strong>{{ formatNumber(kg) }} kg</strong>
          <span v-if="bar > 0" class="muted"> mit {{ formatNumber(bar) }}-kg-Stange</span>
          <span v-else class="muted"> ohne Stange</span>
          <br />{{ plateText(kg) }}
        </p>
        <p v-else class="muted">Zuerst ein Gewicht eintragen.</p>
      </template>

      <template v-if="exercise.type === 'Grundübung'">
        <h3>Aufwärmen</h3>
        <p v-if="!warmUp.length" class="muted">Erst nach der ersten Einheit gibt es ein Ziel-Gewicht und damit Aufwärmsätze.</p>
        <ul v-else>
          <li v-for="(set, index) in warmUp" :key="index">
            <strong>{{ formatNumber(set.kg) }} kg × {{ set.reps }}</strong>
            <span v-if="bar != null" class="muted small"> · {{ plateText(set.kg) }}</span>
          </li>
        </ul>
        <p class="muted small">Nur ein Vorschlag, wird nicht gespeichert.</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 45%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overscroll-behavior: contain;   /* the page behind does not scroll along */
  overflow-y: auto;
  border-radius: var(--radius) var(--radius) 0 0;
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
  background: var(--bg);
}
h3 { margin: 4px 0 0; font-size: 1rem; }
p, ul { margin: 0; }
ul { padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
</style>
