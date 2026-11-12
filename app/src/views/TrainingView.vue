<script setup lang="ts">
defineProps<{ day: string | null }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Zurück</button>
      <h1>{{ day }}</h1>
    </header>
    <p class="muted">Hier entsteht die Eingabe der Sätze (Lastenheft Abschnitt 4.2).</p>
  </main>
</template>
