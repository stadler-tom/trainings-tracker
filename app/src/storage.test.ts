import { describe, expect, it } from 'vitest';
import { parseSetupLink } from './storage';
import { isOlderVersion } from './api';

describe('parseSetupLink', () => {
  it('reads web API address and key from the hash', () => {
    const link = 'https://stadler-tom.github.io/trainings-tracker/#api=' +
      encodeURIComponent('https://script.google.com/macros/s/abc/exec') + '&key=k123';
    expect(parseSetupLink(link)).toEqual({ apiUrl: 'https://script.google.com/macros/s/abc/exec', apiKey: 'k123' });
  });
  it('rejects text without address or key', () => {
    expect(parseSetupLink('https://example.com/')).toBeNull();
    expect(parseSetupLink('https://x/#api=https://a&key=')).toBeNull();
  });
});

describe('isOlderVersion', () => {
  it('compares Major.Minor.Patch', () => {
    expect(isOlderVersion('1.0.0', '1.0.1')).toBe(true);
    expect(isOlderVersion('1.2.0', '1.10.0')).toBe(true);
    expect(isOlderVersion('2.0.0', '1.9.9')).toBe(false);
    expect(isOlderVersion('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('code image', () => {
  it('stores, unlocks and removes the image on the device only', async () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    const { loadCodeImage, saveCodeImage, loadCodeUnlocked, saveCodeUnlocked } = await import('./storage');
    expect(loadCodeImage()).toBeNull();
    expect(loadCodeUnlocked()).toBe(false);
    expect(saveCodeImage('data:image/png;base64,AAA')).toBe(true);
    expect(loadCodeImage()).toBe('data:image/png;base64,AAA');
    expect(loadCodeUnlocked()).toBe(true);
    saveCodeImage(null);
    expect(loadCodeImage()).toBeNull();
    expect(loadCodeUnlocked()).toBe(false);
    saveCodeUnlocked();
    expect(loadCodeUnlocked()).toBe(true);
  });
  it('reports a full storage', async () => {
    globalThis.localStorage = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    const { saveCodeImage } = await import('./storage');
    expect(saveCodeImage('data:x')).toBe(false);
  });
});
