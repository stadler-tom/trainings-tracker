<script setup lang="ts">
const emit = defineEmits<{ openDay: [day: string]; openSettings: [] }>();

// Placeholder until the days are loaded from the web API (requirements spec section 4.1).
const days = ['Beine', 'Push', 'Pull', 'Upper'];
</script>

<template>
  <main class="screen">
    <header class="bar">
      <h1>Training</h1>
      <button class="ghost" @click="emit('openSettings')">Einstellungen</button>
    </header>
    <p class="muted">Welcher Trainingstag ist heute?</p>
    <button v-for="day in days" :key="day" class="big" @click="emit('openDay', day)">{{ day }}</button>
  </main>
</template>
