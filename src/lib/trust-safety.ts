import { z } from 'zod';
import { REPORT_REASONS, REPORT_SUBJECTS, type ReportReason, type ReportSubject } from '@/types/domain';

/** Cermin CHECK `content_reports.details` (migration 20261031100001). */
export const REPORT_DETAILS_MAX = 1000;
/** Cermin `set_user_suspension()`: alasan wajib bermakna, bukan satu huruf. */
export const SUSPENSION_REASON_MIN = 5;
export const MODERATION_NOTE_MAX = 500;
/** Frasa yang diketik untuk hapus akun — sengaja panjang supaya tidak terkirim tak sengaja. */
export const ACCOUNT_DELETE_PHRASE = 'HAPUS AKUN';

const reportSchema = z.object({
  subjectType: z.enum(REPORT_SUBJECTS),
  subjectId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    // Karakter kendali & pengarah teks (RTL override) dibuang: keterangan dibaca moderator apa adanya.
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim())
    .pipe(z.string().max(REPORT_DETAILS_MAX)),
});

export interface ParsedReport {
  readonly subjectType: ReportSubject;
  readonly subjectId: string;
  readonly reason: ReportReason;
  readonly details: string | null;
}

export function parseReportForm(input: { subjectType: string; subjectId: string; reason: string; details: string }): ParsedReport | null {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return null;
  return { ...parsed.data, details: parsed.data.details || null };
}

/**
 * Kata kunci pencarian pengguna admin → huruf, angka, spasi, dan karakter
 * email (`@ . _ + -`). Nilainya dirakit ke filter `or(... ilike ...)` PostgREST:
 * koma dan kurung mengubah BENTUK filter, `%`/`*` mengubah wildcard-nya.
 */
export function normalizeUserSearch(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s.'@_+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Kabar ke pelapor — SAMA PERSIS dengan `resolve_content_report()` (migration
 * 20261101100001; paritas diuji di integrasi). Sengaja umum: tanpa tindakan
 * atas terlapor, tanpa nama terlapor, tanpa catatan internal moderator.
 */
export function reportOutcomeMessage(outcome: 'RESOLVED' | 'DISMISSED', subjectType: ReportSubject, eventTitle: string | null): string {
  const about =
    subjectType === 'user'
      ? 'akun yang kamu laporkan'
      : subjectType === 'question'
        ? 'pertanyaan yang kamu laporkan'
        : eventTitle === null
          ? 'sebuah kegiatan'
          : // Per code point seperti `left()` Postgres, bukan per unit UTF-16.
            `kegiatan "${Array.from(eventTitle).slice(0, 120).join('')}"`;
  return outcome === 'RESOLVED'
    ? `Terima kasih. Laporanmu tentang ${about} sudah ditindaklanjuti moderator. Demi privasi semua pihak, rincian tindakannya tidak kami bagikan.`
    : `Laporanmu tentang ${about} sudah ditinjau moderator dan belum ditemukan pelanggaran Syarat & Ketentuan. Punya bukti tambahan? Kirim laporan baru.`;
}

export function isDeleteConfirmed(raw: string | null | undefined): boolean {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ') === ACCOUNT_DELETE_PHRASE;
}

/** Cermin CHECK `event_questions` (migration 20261101100006). */
export const QUESTION_BODY_MIN = 10;
export const QUESTION_BODY_MAX = 500;
export const ANSWER_MAX = 1500;

/** Teks bebas pertanyaan/jawaban: markup & karakter kendali dibuang, spasi dirapikan; null = di luar batas. */
export function normalizeQuestionText(raw: string | null | undefined, min: number, max: number): string | null {
  const value = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const length = Array.from(value).length;
  return length >= min && length <= max ? value : null;
}

/** Potongan pertanyaan untuk antrean laporan & /laporkan (per code point, 80). */
export function questionExcerpt(body: string): string {
  const chars = Array.from(body.replace(/\s+/g, ' ').trim());
  return chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : chars.join('');
}
