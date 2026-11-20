import { GALLERY_LIMITS } from '@/lib/data/repository';
import { formList } from '@/lib/form-data';
import { stripMarkup } from '@/lib/submission-schema';

/**
 * Slide & gambar deskriptif (ADR-094) — aturan bersama `/submit`, "Buat acara
 * StudentFo", dan studio galeri: satu keterangan per gambar, sejajar urutan
 * berkas yang dikirim `ImageUploadField` (`captionName`).
 */

/** Nama isian berkas gambar pendukung di /submit & Buat acara StudentFo. */
export const SLIDE_FILE_FIELD = 'slides';
/** Nama isian keterangan per gambar — satu per berkas, urutan sama. */
export const SLIDE_CAPTION_FIELD = 'slideCaption';

/** Markup & karakter kendali dibuang, spasi dirapikan, maks. 140 karakter; kosong = null. */
export function cleanCaption(raw: string): string | null {
  const caption = Array.from(stripMarkup(raw).replace(/\s+/g, ' ').trim())
    .slice(0, GALLERY_LIMITS.captionMax)
    .join('')
    .trim();
  return caption || null;
}

/** Keterangan per gambar; isian yang kurang = null (tanpa JavaScript kotaknya tidak ada). */
export function readSlideCaptions(formData: FormData, name: string, count: number): (string | null)[] {
  const raw = formList(formData, name);
  return Array.from({ length: count }, (_, index) => cleanCaption(raw[index] ?? ''));
}
