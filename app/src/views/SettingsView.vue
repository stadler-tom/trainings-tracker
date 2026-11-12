<script setup lang="ts">
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <main class="screen">
    <header class="bar">
      <button class="ghost" @click="emit('back')">‹ Zurück</button>
      <h1>Einstellungen</h1>
    </header>
    <p class="muted">Hier kommen Web-API-Adresse, Schlüssel und Hantelscheiben hin (Lastenheft Abschnitt 4.9).</p>
  </main>
</template>
