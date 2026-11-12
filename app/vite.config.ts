import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GitHub Pages serves the app below /<repository name>/
export default defineConfig({
  base: '/trainings-tracker/',
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(version) },
});
