<script setup lang="ts">
// Record display (section 4.5). Version 2 adds a random picture via the image prop (section 11).
defineProps<{ text: string; image?: string }>();
</script>

<template>
  <div class="record" role="status">
    <img v-if="image" :src="image" alt="" />
    <span>🏆 {{ text }}</span>
  </div>
</template>

<style scoped>
.record {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 600;
  background: color-mix(in srgb, #f9a825 30%, transparent);
}
.record img { max-width: 100%; border-radius: 8px; }
</style>
