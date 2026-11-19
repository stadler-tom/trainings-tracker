import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { applyDarkMode, loadDarkMode } from './storage';

applyDarkMode(loadDarkMode());

createApp(App).mount('#app');
