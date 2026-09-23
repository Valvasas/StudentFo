import { AppError, ERROR_CODES } from '@/lib/errors';

/**
 * Umpan balik Server Action non-akun (tim, kiriman komunitas, tracker).
 *
 * Aturannya sama dengan `auth-messages.ts`: yang dioper lewat URL hanyalah
 * KODE dari daftar tertutup, kalimatnya dirakit di server. Sebelumnya aksi
 * tim mengoper teks pesan apa adanya (`/teams?error=<teks>`) dan halaman
 * menampilkannya — siapa pun bisa membuat tautan `/teams?error=Akun kamu
 * diblokir, hubungi wa.me/...` yang tampil sebagai peringatan resmi di
 * domain kita. Kode tidak dikenal = tidak menampilkan apa-apa.
 */

export const ACTION_ERROR_CODES = [
  'team_not_found',
  'team_full',
  'team_forbidden',
  'leader_cannot_leave',
  'leader_cannot_be_removed',
  'event_unavailable',
  'invalid_team_form',
  'invalid_submission',
  'submission_duplicate',
  'submission_not_found',
  'invalid_request',
  'unknown',
] as const;

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

export const ACTION_ERROR_MESSAGE: Record<ActionErrorCode, string> = {
  team_not_found: 'Tim yang kamu cari tidak ditemukan.',
  team_full: 'Tim ini sudah penuh.',
  team_forbidden: 'Hanya ketua tim yang bisa melakukan ini.',
  leader_cannot_leave: 'Ketua tidak bisa keluar. Bubarkan tim kalau sudah tidak dipakai.',
  leader_cannot_be_removed: 'Ketua tidak bisa dikeluarkan dari timnya sendiri.',
  event_unavailable: 'Kegiatan yang dipilih tidak tersedia.',
  invalid_team_form:
    'Data tim belum valid. Pilih kegiatan, isi judul minimal 4 karakter, dan jumlah anggota 1–50.',
  invalid_submission: 'Ada isian yang belum benar. Periksa keterangan di tiap kolom lalu kirim ulang.',
  submission_duplicate: 'Kegiatan dengan judul dan penyelenggara yang sama sudah ada di katalog.',
  submission_not_found: 'Kiriman ini sudah tidak ada atau sudah ditinjau.',
  invalid_request: 'Permintaan tidak dikenali. Muat ulang halaman lalu coba lagi.',
  unknown: 'Terjadi kesalahan. Coba lagi sebentar lagi.',
};

export const ACTION_NOTICE_CODES = [
  'submission_received',
  'submission_approved',
  'submission_rejected',
] as const;

export type ActionNoticeCode = (typeof ACTION_NOTICE_CODES)[number];

export const ACTION_NOTICE_MESSAGE: Record<ActionNoticeCode, string> = {
  submission_received:
    'Terima kasih! Kiriman kamu masuk antrean verifikasi. Kegiatan baru tayang setelah dicek manual ke sumbernya.',
  submission_approved: 'Kiriman disetujui dan kini tayang di katalog.',
  submission_rejected: 'Kiriman ditolak.',
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseActionErrorCode(value: string | string[] | undefined): ActionErrorCode | null {
  const raw = pickFirst(value);
  return ACTION_ERROR_CODES.includes(raw as ActionErrorCode) ? (raw as ActionErrorCode) : null;
}

export function parseActionNoticeCode(value: string | string[] | undefined): ActionNoticeCode | null {
  const raw = pickFirst(value);
  return ACTION_NOTICE_CODES.includes(raw as ActionNoticeCode) ? (raw as ActionNoticeCode) : null;
}

/** Buat AppError yang alasannya bisa dioper ke URL sebagai kode. */
export function actionError(code: Exclude<ActionErrorCode, 'unknown'>): AppError {
  const status = code === 'team_forbidden' ? 403 : code.endsWith('not_found') ? 404 : 422;
  const errorCode =
    status === 403
      ? ERROR_CODES.FORBIDDEN
      : status === 404
        ? ERROR_CODES.NOT_FOUND
        : ERROR_CODES.VALIDATION_FAILED;
  return new AppError(errorCode, ACTION_ERROR_MESSAGE[code], status, { reason: code });
}

/**
 * Error apa pun → kode aman untuk URL. Error tanpa `reason` yang dikenal
 * (termasuk error driver Postgres) selalu jadi `unknown`; detailnya dicatat
 * ke log server, tidak pernah ke URL.
 */
export function toActionErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof AppError) {
    const code = parseActionErrorCode(error.reason);
    if (code) return code;
  }
  console.error('[action]', error);
  return 'unknown';
}

/**
 * Tambahkan query ke path yang MUNGKIN sudah punya query string. Menempelkan
 * `?error=` mentah ke `/events?type=LOMBA` menghasilkan dua `?` dan parameter
 * yang tidak terbaca.
 */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const [base = '/', existing = ''] = path.split('?', 2);
  const search = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) search.delete(key);
    else search.set(key, value);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}
