import { hasContactInfo, type CommunityFormProblem } from '@/lib/community';
import type { EventComment, EventCommentThread } from '@/types/domain';

/**
 * Komentar di halaman kegiatan (ADR-092). Rel pengamannya SAMA dengan
 * Komunitas (ADR-087) karena penggunanya sama (13+): khusus anggota, nama
 * disingkat, kontak pribadi ditolak, teks polos, laporan dari 3 pelapor
 * berbeda menyembunyikan otomatis. Batas di sini = CHECK & RPC di migration
 * 20261116100001 (dikunci `event-comments.test.ts` dan `119_event_engagement.test.sql`).
 */
export const EVENT_COMMENT_LIMITS = {
  bodyMin: 2,
  bodyMax: 1000,
  /** Cermin `consume_rate_limit('event-comment:…', 30, 86400)`. */
  perDay: 30,
  /** Komentar utama terbaru yang dimuat; balasannya ikut seluruhnya (maks. `repliesMax`). */
  threadsShown: 100,
  repliesMax: 400,
  autoHideReporters: 3,
} as const;

/** Cermin `consume_rate_limit('event-like:…', 300, 86400)` — hanya saat MENYUKAI, bukan membatalkan. */
export const EVENT_LIKE_LIMIT_PER_DAY = 300;

export const EVENT_SHARE_LIMITS = {
  /** Penerima per kiriman. */
  recipientsMax: 20,
  /** Koneksi yang ditawarkan sebagai penerima. */
  recipientsListed: 200,
  /** Kiriman (bukan penerima) per hari — cermin `consume_rate_limit('event-share:…', 20, 86400)`. */
  perDay: 20,
} as const;

export function parseEventComment(value: string): { ok: true; value: string } | { ok: false; problem: CommunityFormProblem } {
  // CRLF dari textarea = satu karakter di `maxLength` peramban; samakan sebelum mengukur.
  const body = value.replace(/\r\n?/g, '\n').trim();
  if (body.length < EVENT_COMMENT_LIMITS.bodyMin || body.length > EVENT_COMMENT_LIMITS.bodyMax) return { ok: false, problem: 'invalid' };
  if (hasContactInfo(body)) return { ok: false, problem: 'contact' };
  return { ok: true, value: body };
}

/**
 * Baris datar (utama + balasan) → utas. Utama terbaru dulu, balasan lama →
 * baru (urutan baca percakapan). Balasan yang induknya tidak ikut termuat
 * (disembunyikan, diblokir, di luar jendela) dibuang — balasan tanpa
 * konteks lebih membingungkan daripada tidak ada.
 */
export function buildCommentThreads(rows: readonly EventComment[]): EventCommentThread[] {
  const threads = rows
    .filter((row) => row.parentId === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));
  const replies = new Map<string, EventComment[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const list = replies.get(row.parentId) ?? [];
    list.push(row);
    replies.set(row.parentId, list);
  }
  return threads.map((thread) => ({
    ...thread,
    replies: (replies.get(thread.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : 1)),
  }));
}

export function sortShareRecipients<T extends { readonly fullName: string }>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
}

export function countComments(threads: readonly EventCommentThread[]): number {
  return threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0);
}

export const COMMENT_ROLE_LABEL: Record<NonNullable<EventComment['role']>, string> = {
  organizer: 'Penyelenggara',
  team: 'Tim StudentFo',
};
