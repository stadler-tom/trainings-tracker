import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { applyDarkMode, loadDarkMode } from './storage';

applyDarkMode(loadDarkMode());

createApp(App).mount('#app');

// loaded fine: a later broken update may reload once more (see index.html)
try { sessionStorage.removeItem('tt.reloaded'); } catch { /* ignore */ }
