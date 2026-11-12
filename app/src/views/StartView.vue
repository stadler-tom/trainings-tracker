<script setup lang="ts">
import type { State } from '../api';
import { formatIsoDate } from '../format';

defineProps<{ configured: boolean; state: State | null; loading: boolean; error: string }>();
const emit = defineEmits<{ openDay: [day: string]; openSettings: []; reload: [] }>();
</script>

<template>
  <main class="screen">
    <header class="bar">
      <h1>Training</h1>
      <button class="ghost" @click="emit('openSettings')">Einstellungen</button>
    </header>

    <template v-if="!configured">
      <p class="muted">Die App ist noch nicht mit deinem Google Sheet verbunden.</p>
      <button class="big" @click="emit('openSettings')">Jetzt einrichten</button>
    </template>

    <p v-else-if="loading && !state" class="muted">Lade Trainingstage …</p>

    <template v-else-if="error && !state">
      <p class="message error">{{ error }}</p>
      <button @click="emit('reload')">Erneut versuchen</button>
    </template>

    <template v-else-if="state">
      <p class="muted">Welcher Trainingstag ist heute?</p>
      <button v-for="day in state.days" :key="day.name" class="big day" @click="emit('openDay', day.name)">
        <span>{{ day.name }}</span>
        <small class="muted">{{ day.lastDate ? 'zuletzt ' + formatIsoDate(day.lastDate) : 'noch nie' }}</small>
      </button>
      <p v-if="error" class="message error">{{ error }}</p>
    </template>
  </main>
</template>
