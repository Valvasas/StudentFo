/**
 * Preferensi tampilan per PERANGKAT (ADR-055): tema dan gerak.
 *
 * Disimpan di localStorage, bukan di akun: orang yang sama memakai tema
 * gelap di laptop dan terang di ponsel, dan pilihan ini harus berlaku
 * sebelum paint pertama (ThemeScript) — termasuk untuk tamu yang belum
 * masuk. Server tidak pernah membacanya; sidebar akun (cookie, ADR-052)
 * berbeda karena server yang merendernya.
 */

export const THEME_STORAGE_KEY = 'sf-theme';
export const MOTION_STORAGE_KEY = 'sf-motion';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const MOTION_PREFERENCES = ['system', 'reduce'] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** Nilai tersimpan yang tidak dikenal (versi lama, diubah tangan) = ikuti perangkat. */
export function parseThemePreference(stored: string | null): ThemePreference {
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function parseMotionPreference(stored: string | null): MotionPreference {
  return stored === 'reduce' ? 'reduce' : 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
