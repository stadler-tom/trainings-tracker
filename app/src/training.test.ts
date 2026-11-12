import { describe, expect, it } from 'vitest';
import { formatNumber } from './training';

describe('formatNumber', () => {
  it('uses a decimal comma and drops trailing zeros', () => {
    expect(formatNumber(26.25)).toBe('26,25');
    expect(formatNumber(40)).toBe('40');
    expect(formatNumber(17.5)).toBe('17,5');
  });
});
