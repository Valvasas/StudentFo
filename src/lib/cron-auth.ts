import { timingSafeEqual } from 'node:crypto';

/**
 * Pemeriksaan `Authorization: Bearer <CRON_SECRET>` untuk endpoint mesin
 * (bot pengirim pengingat, penjadwal). Gagal TERTUTUP: rahasia kosong atau
 * terlalu pendek = tidak ada yang lolos, bukan semua lolos.
 *
 * Perbandingan waktu-konstan: `===` berhenti di byte pertama yang beda,
 * dan selisih waktunya bisa diukur dari jaringan untuk menebak rahasia
 * byte demi byte. `timingSafeEqual` mensyaratkan panjang sama, jadi masukan
 * disalin ke buffer seukuran rahasia dulu — lama perbandingan tidak
 * bergantung pada panjang maupun isi tebakan.
 */
export const MIN_CRON_SECRET_LENGTH = 32;

export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH || !authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization.trim());
  if (!match?.[1]) return false;

  const expected = Buffer.from(secret, 'utf8');
  const given = Buffer.from(match[1], 'utf8');
  const padded = Buffer.alloc(expected.length);
  given.copy(padded, 0, 0, Math.min(given.length, expected.length));
  return timingSafeEqual(padded, expected) && given.length === expected.length;
}
