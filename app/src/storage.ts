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
