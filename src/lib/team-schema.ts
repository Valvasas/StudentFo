import { z } from 'zod';

/**
 * Aturan validasi form tim lomba (Phase 3).
 *
 * Dipisah dari kode Server Action supaya bisa diuji tanpa menyalakan
 * runtime React Server Component — pola yang sama dengan `auth-schema.ts`.
 *
 * Setiap batas panjang di sini MENCERMINKAN kolomnya di migration 0001,
 * bukan angka yang enak dilihat. Kalau validasi lebih longgar daripada
 * kolomnya, kegagalan muncul sebagai error driver Postgres yang tidak bisa
 * dibaca pengguna; kalau lebih ketat tanpa alasan, data yang sah ditolak.
 */

/** `teams.title` = VARCHAR(255). */
export const teamTitleSchema = z
  .string()
  .trim()
  .min(4, 'Judul tim minimal 4 karakter.')
  .max(255, 'Judul tim maksimal 255 karakter.')
  .transform((value) => value.replace(/\s+/g, ' '));

/** `teams.description` = TEXT. Batas 1000 adalah keputusan produk, bukan kolom. */
export const teamDescriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Deskripsi maksimal 1000 karakter.');

/**
 * `teams.slots_needed` = INT dengan CHECK (slots_needed BETWEEN 1 AND 50).
 * Batas itu ditegakkan ulang di sini supaya angka di luar rentang ditolak
 * dengan kalimat Indonesia, bukan dengan pelanggaran CHECK constraint.
 */
export const slotsNeededSchema = z
  .number({ invalid_type_error: 'Jumlah anggota harus berupa angka.' })
  .int('Jumlah anggota harus bilangan bulat.')
  .min(1, 'Tim minimal mencari 1 anggota.')
  .max(50, 'Tim maksimal mencari 50 anggota.');

export const createTeamSchema = z.object({
  eventId: z.string().uuid('Kegiatan yang dipilih tidak valid.'),
  title: teamTitleSchema,
  // Deskripsi kosong disimpan sebagai NULL, bukan string kosong: kolomnya
  // nullable, dan "" vs NULL yang bercampur membuat pengecekan "ada
  // deskripsi atau tidak" harus menangani dua bentuk untuk arti yang sama.
  description: teamDescriptionSchema.transform((value) => (value.length === 0 ? null : value)),
  slotsNeeded: slotsNeededSchema,
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

/**
 * FormData selalu memberi string. Konversi dilakukan di sini, sekali, supaya
 * Server Action tidak mengulang `Number(...)` yang gampang lupa divalidasi.
 */
export function parseCreateTeamForm(formData: FormData) {
  const rawSlots = formData.get('slotsNeeded')?.toString().trim() ?? '';
  return createTeamSchema.safeParse({
    eventId: formData.get('eventId')?.toString().trim() ?? '',
    title: formData.get('title')?.toString() ?? '',
    description: formData.get('description')?.toString() ?? '',
    // String kosong sengaja dijadikan NaN, bukan 0: Number('') === 0 akan
    // lolos sebagai "0 anggota" dan ditolak dengan pesan yang salah arah.
    slotsNeeded: rawSlots === '' ? Number.NaN : Number(rawSlots),
  });
}
