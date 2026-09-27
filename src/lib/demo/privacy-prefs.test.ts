import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIVACY_PREFS, canSee, parsePrivacyPrefs } from './privacy-prefs';

describe('canSee', () => {
  it('publik terlihat semua, tim hanya anggota, aku tidak siapa pun', () => {
    expect(canSee('publik', 'publik')).toBe(true);
    expect(canSee('tim', 'publik')).toBe(false);
    expect(canSee('tim', 'tim')).toBe(true);
    expect(canSee('aku', 'tim')).toBe(false);
  });
});

describe('parsePrivacyPrefs', () => {
  it('nilai asing jatuh ke bawaan per kolom', () => {
    const parsed = parsePrivacyPrefs({ visibility: { city: 'aku', contact: 'dunia' }, listedInTeams: 'ya', messages: 'tidak' });
    expect(parsed.visibility.city).toBe('aku');
    expect(parsed.visibility.contact).toBe(DEFAULT_PRIVACY_PREFS.visibility.contact);
    expect(parsed.listedInTeams).toBe(true);
    expect(parsed.messages).toBe('tidak');
    expect(parsePrivacyPrefs(42)).toEqual(DEFAULT_PRIVACY_PREFS);
  });
});
