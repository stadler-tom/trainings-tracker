<script setup lang="ts">
// Loading indicator: a ring whose arc grows and shrinks while it turns,
// so a longer wait (cold start of the web API) never looks stuck.
defineProps<{ label: string }>();
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
      <circle class="track" cx="25" cy="25" r="20" />
      <circle class="arc" cx="25" cy="25" r="20" />
    </svg>
    <p class="muted">{{ label }}</p>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 40px 0 24px;
  animation: loading-appear 300ms ease-out both;
}

.spinner {
  width: 52px;
  height: 52px;
  animation: spinner-rotate 1.6s linear infinite;
}

.spinner circle {
  fill: none;
  stroke-width: 4.5;
}

.track {
  stroke: color-mix(in srgb, var(--accent) 15%, transparent);
}

.arc {
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-dasharray: 1 126;
  stroke-dashoffset: 0;
  animation: spinner-arc 1.4s ease-in-out infinite;
}

@keyframes spinner-rotate {
  to { transform: rotate(360deg); }
}

/* circumference of r = 20 is about 126 */
@keyframes spinner-arc {
  0% { stroke-dasharray: 1 126; stroke-dashoffset: 0; }
  50% { stroke-dasharray: 90 126; stroke-dashoffset: -30; }
  100% { stroke-dasharray: 90 126; stroke-dashoffset: -124; }
}

@keyframes loading-appear {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

/* iPhone setting "Reduce Motion": a calm pulse instead of turning */
@media (prefers-reduced-motion: reduce) {
  .loading { animation: none; }
  .spinner { animation: none; }
  .arc {
    stroke-dasharray: 60 126;
    animation: spinner-pulse 1.6s ease-in-out infinite;
  }
}

@keyframes spinner-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
