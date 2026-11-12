<script setup lang="ts">
// Record display (section 4.5). An e1RM record also shows a record picture (section 11).
defineProps<{ text: string; image?: string }>();
</script>

<template>
  <div class="record" :class="{ 'with-image': image }" role="status">
    <img v-if="image" :src="image" alt="" />
    <span>🏆 {{ text }}</span>
  </div>
</template>

<style scoped>
.record {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 600;
  background: color-mix(in srgb, #f9a825 30%, transparent);
}

.record.with-image {
  padding: 0 12px 0 0;
  overflow: hidden;
}

.record img {
  width: 104px;
  flex-shrink: 0;
  align-self: flex-end;
  margin-top: 6px;
  transform-origin: bottom center;
  animation: picture-pop 650ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms both;
}

/* the picture springs up from the bottom edge of the banner */
@keyframes picture-pop {
  0% { opacity: 0; transform: translateY(60%) scale(0.6) rotate(-8deg); }
  60% { opacity: 1; transform: translateY(-4%) scale(1.06) rotate(3deg); }
  100% { opacity: 1; transform: none; }
}

/* iPhone setting "Reduce Motion": fade only */
@media (prefers-reduced-motion: reduce) {
  .record img { animation: picture-fade 200ms ease-out both; }
}

@keyframes picture-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
