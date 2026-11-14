<script setup lang="ts">
// Summary after saving or from the history: total volume, PRs, sets with e1RM and a fun comparison.
import { computed } from 'vue';
import { formatNumber } from '../training';
import { funComparison, type Summary } from '../summary';

const props = defineProps<{ summary: Summary; closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

const dateText = computed(() => {
  const [year, month, day] = props.summary.date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('de-DE',
    { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
});
const volumeText = computed(() => `${Math.round(props.summary.volume).toLocaleString('de-DE')} kg`);
const prText = computed(() => `${props.summary.prCount} ${props.summary.prCount === 1 ? 'PR' : 'PRs'}`);
const fun = funComparison(props.summary.volume);   // picked once per summary
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Trainingsauswertung">
      <header class="head">
        <button class="close" aria-label="Schließen" @click="emit('close')">✕</button>
        <h2>{{ summary.day }}<span v-if="summary.deload" class="muted"> · Deload</span></h2>
      </header>
      <p class="muted date">{{ dateText }}</p>
      <div class="stats">
        <span>⚖️ {{ volumeText }}</span>
        <span>🏆 {{ prText }}</span>
      </div>

      <div v-for="exercise in summary.exercises" :key="exercise.name" class="exercise">
        <div class="row title">
          <strong>{{ exercise.name }}</strong>
          <strong>1RM</strong>
        </div>
        <div v-for="set in exercise.sets" :key="set.set" class="row" :class="{ pr: set.isPr }">
          <span><span class="nr">{{ set.set }}</span>{{ formatNumber(set.kg) }} kg × {{ set.reps }}<span v-if="set.isPr"> 🏆</span></span>
          <span class="muted">{{ Math.round(set.e1rm) }}</span>
        </div>
      </div>

      <p v-if="summary.note" class="note">📝 {{ summary.note }}</p>
      <p class="fun">{{ fun }}</p>
      <button class="primary big done" @click="emit('close')">{{ closeLabel ?? 'Fertig' }}</button>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 16px 20px calc(env(safe-area-inset-bottom) + 20px);
  border-radius: 20px 20px 0 0;
  background: var(--bg);
}
.head { display: flex; align-items: center; gap: 12px; }
.head h2 { margin: 0; font-size: 1.15rem; }
.close { width: 44px; padding: 0; font-size: 1.1rem; }
.date { margin: 8px 0 4px; }
.stats { display: flex; gap: 24px; margin-bottom: 8px; font-size: 1.05rem; }
.exercise { margin-top: 14px; }
.row { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0; font-size: 1.05rem; }
.title { padding-bottom: 4px; }
.nr { display: inline-block; width: 1.8em; color: var(--muted); }
.pr { font-weight: 600; }
.fun {
  margin: 20px 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  font-size: 1.05rem;
  font-weight: 600;
  text-align: center;
}
.done { width: 100%; text-align: center; }
.note { margin: 16px 0 0; color: var(--muted); }

</style>
