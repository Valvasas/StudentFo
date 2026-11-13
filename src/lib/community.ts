import { z } from 'zod';
import { formText } from '@/lib/form-data';
import { daysAgoLabel } from '@/lib/network';

/**
 * Komunitas (ADR-087): bentuk & aturan yang dipakai bersama form, Server
 * Action, dan kedua repository. Batas di sini = CHECK & RPC di migration
 * 20261112100002 (dikunci `community.test.ts`).
 */

export const COMMUNITY_TOPICS = ['tanya', 'cari-tim', 'info', 'cerita'] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number];

export const COMMUNITY_TOPIC_LABEL: Record<CommunityTopic, string> = {
  tanya: 'Tanya',
  'cari-tim': 'Cari tim',
  info: 'Info & tips',
  cerita: 'Cerita',
};

export const COMMUNITY_TOPIC_HINT: Record<CommunityTopic, string> = {
  tanya: 'Bingung soal syarat, berkas, atau cara daftar? Tanya sesama peserta.',
  'cari-tim': 'Butuh desainer, programmer, atau penulis untuk lomba? Ceritakan timmu.',
  info: 'Bagikan info peluang, tips menulis esai, atau cara lolos seleksi.',
  cerita: 'Pengalaman ikut lomba, beasiswa, atau magang — yang lolos maupun belum.',
};

export const COMMUNITY_LIMITS = {
  titleMin: 6,
  titleMax: 120,
  bodyMin: 10,
  bodyMax: 2000,
  replyMin: 2,
  replyMax: 1000,
  pageSize: 20,
  /** Cermin `consume_rate_limit(...)` di RPC. */
  postsPerDay: 5,
  repliesPerDay: 30,
  helpfulPerDay: 200,
  /** Pelapor BERBEDA yang menyembunyikan tulisan otomatis. */
  autoHideReporters: 3,
  repliesShown: 300,
} as const;

export function toCommunityTopic(value: string | null | undefined): CommunityTopic | null {
  return (COMMUNITY_TOPICS as readonly string[]).includes(value ?? '') ? (value as CommunityTopic) : null;
}

/** "Dinda Pratiwi Sari" → "Dinda S." — cermin `community_display_name()`. */
export function communityDisplayName(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Anggota';
  const words = name.split(' ');
  if (words.length === 1) return name.slice(0, 40);
  return `${words[0]!.slice(0, 40)} ${words.at(-1)!.charAt(0).toUpperCase()}.`;
}

/**
 * Kontak pribadi yang ditolak di ruang publik: nomor HP Indonesia, email,
 * tautan WhatsApp/Telegram/LINE. Cermin `community_has_contact()` — contoh
 * uji yang sama ada di `118_community.test.sql`.
 */
export const CONTACT_PATTERNS: readonly RegExp[] = [
  /(\+62|62|0)[ .-]?8[1-9]([ .-]?[0-9]){7,11}/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(wa\.me|chat\.whatsapp\.com|t\.me|line\.me)\//i,
];

export function hasContactInfo(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(min).max(max));

const postSchema = z.object({
  topic: z.enum(COMMUNITY_TOPICS),
  title: trimmed(COMMUNITY_LIMITS.titleMin, COMMUNITY_LIMITS.titleMax),
  body: trimmed(COMMUNITY_LIMITS.bodyMin, COMMUNITY_LIMITS.bodyMax),
  eventId: z.string().uuid().nullable(),
});

export type CommunityPostInput = z.infer<typeof postSchema>;
export type CommunityFormProblem = 'invalid' | 'contact';

/** Form → input, atau masalah tertutup. Kontak diperiksa di sini juga supaya pesannya jelas tanpa bolak-balik ke database. */
export function parseCommunityPostForm(formData: FormData): { ok: true; value: CommunityPostInput } | { ok: false; problem: CommunityFormProblem } {
  const parsed = postSchema.safeParse({
    topic: formText(formData, 'topic'),
    title: formText(formData, 'title'),
    body: formText(formData, 'body'),
    eventId: formText(formData, 'eventId').trim() || null,
  });
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  if (hasContactInfo(parsed.data.title) || hasContactInfo(parsed.data.body)) return { ok: false, problem: 'contact' };
  return { ok: true, value: parsed.data };
}

export function parseCommunityReply(value: string): { ok: true; value: string } | { ok: false; problem: CommunityFormProblem } {
  const body = value.trim();
  if (body.length < COMMUNITY_LIMITS.replyMin || body.length > COMMUNITY_LIMITS.replyMax) return { ok: false, problem: 'invalid' };
  if (hasContactInfo(body)) return { ok: false, problem: 'contact' };
  return { ok: true, value: body };
}

/** Kursor lini masa di URL (`?sebelum=`): waktu aktivitas terakhir + id, keduanya divalidasi. */
export interface CommunityCursor {
  readonly at: string;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCommunityCursor(cursor: CommunityCursor): string {
  return `${cursor.at}_${cursor.id}`;
}

export function parseCommunityCursor(value: string | null | undefined): CommunityCursor | null {
  if (!value || value.length > 80) return null;
  const separator = value.lastIndexOf('_');
  const at = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || !UUID.test(id) || Number.isNaN(Date.parse(at))) return null;
  return { at: new Date(at).toISOString(), id };
}

export function isCommunityId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** "baru saja" / "12 menit lalu" / "3 jam lalu", lalu per hari kalender (`daysAgoLabel`). Forum hidup per jam, bukan per hari. */
export function communityTimeLabel(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} jam lalu`;
  return daysAgoLabel(iso, now);
}
