// Local persistence on the device (requirements spec sections 4.2 and 4.9).
// localStorage can be unavailable (private mode); failures fall back to defaults.

export interface Settings {
  apiUrl: string;
  apiKey: string;
  plates: number[];
}

const SETTINGS_KEY = 'tt.settings';
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (stored) return { apiUrl: '', apiKey: '', plates: DEFAULT_PLATES, ...stored };
  } catch {
    // ignore broken or unavailable storage
  }
  return { apiUrl: '', apiKey: '', plates: DEFAULT_PLATES };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore: settings stay in memory for this session
  }
}

/**
 * Reads web API URL and key from a setup link such as
 * https://.../trainings-tracker/#api=<url>&key=<key>. Returns null if the text is not a setup link.
 */
export function parseSetupLink(text: string): { apiUrl: string; apiKey: string } | null {
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : '';
  const params = new URLSearchParams(hash);
  const apiUrl = params.get('api') ?? '';
  const apiKey = params.get('key') ?? '';
  if (!apiUrl.startsWith('https://') || !apiKey) return null;
  return { apiUrl, apiKey };
}

// Dark mode is chosen per device in the settings; without a choice the app follows the system.
const THEME_KEY = 'tt.theme';

export function loadDarkMode(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored === 'dark';
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Switches the colours at once (and the browser bar colour) and remembers the choice. */
export function applyDarkMode(dark: boolean, remember = false): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111827' : '#ffffff');
  if (!remember) return;
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  } catch {
    // ignore: the choice stays for this session
  }
}

// Personal code image (e.g. a gym entry QR code), stored only on this device as a data URL.
// The feature is hidden: its settings section appears only after unlocking it on the device.
const CODE_IMAGE_KEY = 'tt.codeImage';
const CODE_UNLOCKED_KEY = 'tt.codeUnlocked';

export function loadCodeImage(): string | null {
  try {
    return localStorage.getItem(CODE_IMAGE_KEY);
  } catch {
    return null;
  }
}

/** Stores the image; returns false if the device storage is full or unavailable. */
export function saveCodeImage(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(CODE_IMAGE_KEY, dataUrl);
    else localStorage.removeItem(CODE_IMAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadCodeUnlocked(): boolean {
  try {
    return localStorage.getItem(CODE_UNLOCKED_KEY) === '1' || localStorage.getItem(CODE_IMAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveCodeUnlocked(): void {
  try {
    localStorage.setItem(CODE_UNLOCKED_KEY, '1');
  } catch {
    // ignore: stays unlocked for this session
  }
}

// Last loaded state, shown at once on the next start while the fresh state loads in the
// background. It is a copy of the sheet for display only and belongs to one web API URL.
const STATE_KEY = 'tt.state';

export function loadCachedState<T>(apiUrl: string): T | null {
  try {
    const cached = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    return cached && cached.apiUrl === apiUrl ? cached.state : null;
  } catch {
    return null;
  }
}

export function saveCachedState(apiUrl: string, state: unknown): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ apiUrl, state }));
  } catch {
    // ignore: then the next start simply waits for the web API
  }
}
