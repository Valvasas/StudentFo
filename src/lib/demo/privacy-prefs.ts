/**
 * Pengaturan visibilitas (kanvas Privasi). Profil publik, kontak, dan
 * pencapaian baru ada di mode data contoh (profile-extras.ts), jadi siapa
 * yang boleh melihatnya pun baru tersimpan di peramban.
 */
export const AUDIENCES = ['publik', 'tim', 'aku'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { publik: 'Semua pengguna', tim: 'Anggota tim', aku: 'Hanya aku' };

export const VISIBILITY_FIELDS = [
  { key: 'headline', label: 'Headline & bio' },
  { key: 'city', label: 'Kota domisili' },
  { key: 'contact', label: 'Nomor HP & tautan' },
  { key: 'achievements', label: 'Pencapaian' },
] as const;
export type VisibilityField = (typeof VISIBILITY_FIELDS)[number]['key'];

export const MESSAGE_POLICIES = [
  { value: 'semua', label: 'Semua pengguna' },
  { value: 'tim', label: 'Anggota tim saja' },
  { value: 'tidak', label: 'Tidak ada' },
] as const;
export type MessagePolicy = (typeof MESSAGE_POLICIES)[number]['value'];

export interface PrivacyPrefs {
  readonly visibility: Record<VisibilityField, Audience>;
  readonly listedInTeams: boolean;
  readonly acceptInvites: boolean;
  readonly messages: MessagePolicy;
}

export const PRIVACY_PREFS_KEY = 'sf-demo-privacy';

export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  visibility: { headline: 'publik', city: 'publik', contact: 'tim', achievements: 'publik' },
  listedInTeams: true,
  acceptInvites: true,
  messages: 'tim',
};

/** Apakah `viewer` boleh melihat kolom dengan pengaturan `audience`. */
export function canSee(audience: Audience, viewer: Exclude<Audience, 'aku'>): boolean {
  if (audience === 'aku') return false;
  return audience === 'publik' || viewer === 'tim';
}

export function parsePrivacyPrefs(raw: unknown): PrivacyPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_PRIVACY_PREFS;
  const value = raw as Record<string, unknown>;
  const stored = typeof value.visibility === 'object' && value.visibility !== null ? (value.visibility as Record<string, unknown>) : {};
  const visibility = Object.fromEntries(
    VISIBILITY_FIELDS.map(({ key }) => [key, AUDIENCES.find((item) => item === stored[key]) ?? DEFAULT_PRIVACY_PREFS.visibility[key]]),
  ) as PrivacyPrefs['visibility'];
  return {
    visibility,
    listedInTeams: typeof value.listedInTeams === 'boolean' ? value.listedInTeams : DEFAULT_PRIVACY_PREFS.listedInTeams,
    acceptInvites: typeof value.acceptInvites === 'boolean' ? value.acceptInvites : DEFAULT_PRIVACY_PREFS.acceptInvites,
    messages: MESSAGE_POLICIES.find((item) => item.value === value.messages)?.value ?? DEFAULT_PRIVACY_PREFS.messages,
  };
}
