import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GitHub Pages serves the app below /<repository name>/
export default defineConfig({
  base: '/trainings-tracker/',
  plugins: [vue()],
  // two pages: the phone app and the PC analysis below /auswertung/
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        analysis: fileURLToPath(new URL('./auswertung/index.html', import.meta.url)),
      },
    },
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
});
