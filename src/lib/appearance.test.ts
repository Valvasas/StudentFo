import { describe, expect, it } from 'vitest';
import { parseMotionPreference, parseThemePreference, resolveTheme } from './appearance';

describe('preferensi tampilan', () => {
  it('nilai tersimpan tak dikenal jatuh ke "ikuti perangkat"', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseMotionPreference('full')).toBe('system');
    expect(parseMotionPreference('reduce')).toBe('reduce');
  });

  it('pilihan eksplisit mengalahkan setelan perangkat', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
