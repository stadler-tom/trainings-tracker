import { createApp } from 'vue';
import AnalysisApp from './AnalysisApp.vue';
import './analysis.css';

createApp(AnalysisApp).mount('#app');

// loaded fine: a later broken update may reload once more (see index.html)
try { sessionStorage.removeItem('tt.reloaded'); } catch { /* ignore */ }
