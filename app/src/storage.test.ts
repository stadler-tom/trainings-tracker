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
