import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// GitHub Pages serves the app below /<repository name>/
export default defineConfig({
  base: '/trainings-tracker/',
  plugins: [vue()],
});
