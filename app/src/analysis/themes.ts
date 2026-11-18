// Colour schemes of the PC analysis; the choice is kept in the browser.
// Traffic-light colours (rising / stalled / falling) are the same in every scheme.

export interface Theme {
  id: string;
  name: string;
  accent: string;                  // navigation, active buttons, frames
  chart: string;                   // e1RM line, bars
  record: string;                  // record marks
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  line2: string;
  neutral: string;
}

export const THEMES: Theme[] = [
  { id: 'navy', name: 'Dunkelblau & Amber', accent: '#1e3a8a', chart: '#1e3a8a', record: '#b45309', bg: '#f1f4f9',
    surface: '#ffffff', text: '#111b33', muted: '#4a5674', line: '#dde3ee', line2: '#c5cfe0', neutral: '#a2b0cb' },
  { id: 'petrol', name: 'Petrol & Orange', accent: '#0f766e', chart: '#0f766e', record: '#c2410c', bg: '#eef3f3',
    surface: '#ffffff', text: '#12262b', muted: '#4b5f63', line: '#dbe5e6', line2: '#c3d2d4', neutral: '#9db4b7' },
  { id: 'slate', name: 'Schiefer & Grün', accent: '#15803d', chart: '#334155', record: '#15803d', bg: '#f1f5f9',
    surface: '#ffffff', text: '#0f172a', muted: '#475569', line: '#e2e8f0', line2: '#cbd5e1', neutral: '#94a3b8' },
  { id: 'red', name: 'Rot wie die alte App', accent: '#c62828', chart: '#c62828', record: '#2563eb', bg: '#f3f4f6',
    surface: '#ffffff', text: '#1f2937', muted: '#4b5563', line: '#e5e7eb', line2: '#d1d5db', neutral: '#9ca3af' },
];

const THEME_KEY = 'tt.analysis.theme';

export function loadThemeId(): string {
  try {
    const id = localStorage.getItem(THEME_KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    // storage unavailable: default scheme
  }
  return THEMES[0].id;
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // ignore: the choice lasts for this visit
  }
}

/** CSS custom properties for the page root. */
export function themeStyle(theme: Theme): Record<string, string> {
  return {
    '--a-accent': theme.accent, '--a-chart': theme.chart, '--a-record': theme.record, '--a-bg': theme.bg,
    '--a-surface': theme.surface, '--a-text': theme.text, '--a-muted': theme.muted, '--a-line': theme.line,
    '--a-line2': theme.line2, '--a-neutral': theme.neutral,
  };
}
