<script setup lang="ts">
// Pull down at the top of the page to reload the app, like in native iOS apps
// (a web app on the home screen does not offer this itself).
// A full reload also loads a new app version; a running training stays in local storage.
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ enabled: boolean }>();

const THRESHOLD = 70;          // px pulled (after resistance) to trigger the reload
const MAX = 110;
const RESISTANCE = 0.5;

const pull = ref(0);           // current pull distance in px
const refreshing = ref(false);
let startY: number | null = null;

function onStart(event: TouchEvent) {
  if (!props.enabled || refreshing.value || window.scrollY > 0 || event.touches.length !== 1) return;
  // inside an open window (summary, plate calculator) the finger scrolls that window, not the page
  if ((event.target as Element | null)?.closest?.('[role="dialog"]')) return;
  startY = event.touches[0].clientY;
}

function onMove(event: TouchEvent) {
  if (startY === null) return;
  const distance = (event.touches[0].clientY - startY) * RESISTANCE;
  if (distance <= 0 || window.scrollY > 0) {
    pull.value = 0;
    return;
  }
  pull.value = Math.min(distance, MAX);
  if (event.cancelable) event.preventDefault();   // no page bounce while pulling
}

function onEnd() {
  if (startY === null) return;
  startY = null;
  if (pull.value >= THRESHOLD) {
    refreshing.value = true;
    pull.value = THRESHOLD;
    window.location.reload();
  } else {
    pull.value = 0;
  }
}

onMounted(() => {
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
});
onBeforeUnmount(() => {
  document.removeEventListener('touchstart', onStart);
  document.removeEventListener('touchmove', onMove);
  document.removeEventListener('touchend', onEnd);
  document.removeEventListener('touchcancel', onEnd);
});

const CIRCUMFERENCE = 2 * Math.PI * 14;
</script>

<template>
  <div
    class="pull"
    :class="{ active: pull > 0, ready: pull >= THRESHOLD, refreshing }"
    :style="{ transform: `translate(-50%, ${pull - 56}px)` }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 36 36">
      <circle class="track" cx="18" cy="18" r="14" />
      <circle
        class="arc"
        cx="18" cy="18" r="14"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="refreshing ? CIRCUMFERENCE * 0.7 : CIRCUMFERENCE * (1 - Math.min(pull / THRESHOLD, 1))"
      />
      <path v-if="!refreshing" class="arrow" d="M18 11v12m-5-5 5 5 5-5" />
    </svg>
  </div>
</template>

<style scoped>
.pull {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 50%;
  z-index: 50;
  width: 44px;
  height: 44px;
  padding: 4px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.15);
  opacity: 0;
  transition: transform 200ms ease-out, opacity 150ms;
  pointer-events: none;
}
.pull.active { opacity: 1; transition: opacity 150ms; }
.pull.refreshing { opacity: 1; }
svg { width: 100%; height: 100%; }
.track { fill: none; stroke: color-mix(in srgb, var(--accent) 15%, transparent); stroke-width: 3; }
.arc {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
}
.arrow {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 150ms;
  transform-origin: center;
}
.ready .arrow { transform: rotate(180deg); }
.refreshing svg { animation: pull-spin 0.8s linear infinite; }
@keyframes pull-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .refreshing svg { animation: none; }
}
</style>
