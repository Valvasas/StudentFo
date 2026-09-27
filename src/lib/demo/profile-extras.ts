/**
 * Bagian profil yang belum punya kolom di database (ADR-039): status,
 * headline, bio, kota, tautan, peran & keahlian tim, pencapaian. Disimpan
 * di peramban (mode data contoh saja) sampai migrasinya ada. Semua pembaca
 * memvalidasi bentuknya — isi localStorage bisa diubah siapa saja.
 */
export const PROFILE_STATUSES = [
  { value: 'Mencari tim', hint: 'Tampil di Cari Tim. Tim bisa mengajakmu lebih dulu.' },
  { value: 'Terbuka untuk magang', hint: 'Penyelenggara magang bisa melihat profilmu.' },
  { value: 'Sedang fokus', hint: 'Tidak menerima ajakan tim untuk sementara.' },
] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number]['value'];

export interface Achievement {
  readonly title: string;
  readonly event: string;
  readonly year: string;
}

export interface ProfileExtras {
  readonly status: ProfileStatus;
  readonly headline: string;
  readonly bio: string;
  readonly city: string;
  readonly phone: string;
  readonly whatsapp: boolean;
  readonly linkedin: string;
  readonly portfolio: string;
  readonly roles: readonly string[];
  readonly skills: readonly string[];
  readonly achievements: readonly Achievement[];
}

export const PROFILE_EXTRAS_KEY = 'sf-demo-profile';

export const DEFAULT_PROFILE_EXTRAS: ProfileExtras = {
  status: 'Mencari tim',
  headline: 'Suka riset pengguna dan merapikan antarmuka.',
  bio: 'Dua tahun terakhir ikut lomba desain produk, paling senang di tahap wawancara pengguna dan menyusun alur. Sedang cari tim untuk hackathon layanan publik.',
  city: 'Bandung',
  phone: '',
  whatsapp: true,
  linkedin: 'linkedin.com/in/contoh',
  portfolio: '',
  roles: ['Desainer UI/UX', 'Riset'],
  skills: ['Figma', 'Riset pengguna', 'Prototyping'],
  achievements: [
    { title: 'Juara 2 UI/UX Competition', event: 'Contoh lomba tingkat nasional', year: '2025' },
    { title: 'Finalis divisi desain UX', event: 'Contoh kompetisi TIK', year: '2025' },
  ],
};

export const TEAM_ROLE_OPTIONS = ['Desainer UI/UX', 'Frontend', 'Backend', 'Data', 'Riset', 'Presentasi', 'Penulis'] as const;

const text = (value: unknown, max: number): string | null => (typeof value === 'string' ? value.slice(0, max) : null);
const list = (value: unknown, maxItems: number, maxLength: number): string[] | null =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, maxLength)).slice(0, maxItems) : null;

/** Gabungkan isi tersimpan dengan bawaan; kolom yang rusak jatuh ke nilai bawaan, bukan melempar. */
export function parseProfileExtras(raw: unknown): ProfileExtras {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_PROFILE_EXTRAS;
  const value = raw as Record<string, unknown>;
  const status = PROFILE_STATUSES.find((item) => item.value === value.status)?.value;
  const achievements = Array.isArray(value.achievements)
    ? value.achievements
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({ title: text(item.title, 120) ?? '', event: text(item.event, 120) ?? '', year: text(item.year, 4) ?? '' }))
        .filter((item) => item.title)
        .slice(0, 20)
    : null;
  return {
    status: status ?? DEFAULT_PROFILE_EXTRAS.status,
    headline: text(value.headline, 140) ?? DEFAULT_PROFILE_EXTRAS.headline,
    bio: text(value.bio, 600) ?? DEFAULT_PROFILE_EXTRAS.bio,
    city: text(value.city, 60) ?? DEFAULT_PROFILE_EXTRAS.city,
    phone: text(value.phone, 20) ?? DEFAULT_PROFILE_EXTRAS.phone,
    whatsapp: typeof value.whatsapp === 'boolean' ? value.whatsapp : DEFAULT_PROFILE_EXTRAS.whatsapp,
    linkedin: text(value.linkedin, 200) ?? DEFAULT_PROFILE_EXTRAS.linkedin,
    portfolio: text(value.portfolio, 200) ?? DEFAULT_PROFILE_EXTRAS.portfolio,
    roles: list(value.roles, 7, 40) ?? DEFAULT_PROFILE_EXTRAS.roles,
    skills: list(value.skills, 12, 40) ?? DEFAULT_PROFILE_EXTRAS.skills,
    achievements: achievements ?? DEFAULT_PROFILE_EXTRAS.achievements,
  };
}

/**
 * "linkedin.com/in/x" → URL https absolut. Selain http(s) → null, supaya
 * isian tersimpan tidak pernah dirender sebagai `javascript:` atau skema lain.
 */
export function toExternalUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "0812-3456 7890" / "+62 812…" → nomor seluler Indonesia yang wajar, atau null. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, '');
  return /^(\+62|0)8\d{7,11}$/.test(compact) ? compact : null;
}

/** Tahun pencapaian: 4 digit, tidak lebih dari tahun depan (kegiatan yang sudah dijadwalkan). */
export function isAchievementYear(raw: string, now: Date = new Date()): boolean {
  if (!/^\d{4}$/.test(raw)) return false;
  const year = Number(raw);
  return year >= 1990 && year <= now.getFullYear() + 1;
}

/**
 * Dokumen siap pakai (kanvas Data Diri #dokumen). Mode demo hanya
 * mencatat NAMA berkas yang dipilih — isinya tidak dibaca, tidak disimpan,
 * dan tidak dikirim ke mana pun. Unggahan sungguhan butuh Storage + RLS
 * (TASKS.md), bukan localStorage.
 */
export interface DemoDocument {
  readonly name: string;
  readonly file: string;
  readonly date: string;
}

export const DOCUMENTS_KEY = 'sf-demo-docs';
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export const DEFAULT_DOCUMENTS: readonly DemoDocument[] = [
  { name: 'Kartu pelajar/mahasiswa', file: '', date: '' },
  { name: 'Surat keterangan aktif', file: '', date: '' },
  { name: 'CV', file: '', date: '' },
  { name: 'Transkrip nilai', file: '', date: '' },
];

/** Daftar jenis dokumen tetap; hanya nama berkas & tanggal yang dibaca dari penyimpanan. */
export function parseDocuments(raw: unknown): readonly DemoDocument[] {
  if (!Array.isArray(raw)) return DEFAULT_DOCUMENTS;
  return DEFAULT_DOCUMENTS.map((doc) => {
    const stored = raw.find((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && (item as Record<string, unknown>).name === doc.name);
    if (!stored) return doc;
    return { name: doc.name, file: text(stored.file, 120) ?? '', date: text(stored.date, 20) ?? '' };
  });
}

/** Cek berkas sebelum dicatat. Mengembalikan pesan galat, atau null bila boleh. */
export function documentError(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return 'Format harus PDF, JPG, atau PNG.';
  if (file.size > DOCUMENT_MAX_BYTES) return 'Ukuran maksimal 5 MB.';
  return null;
}
