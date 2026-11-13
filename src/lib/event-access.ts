/**
 * Yang terbuka untuk tamu di halaman kegiatan (ADR-085).
 *
 * Gerbang ini gerbang PRODUK, bukan batas keamanan: info kegiatan memang
 * diumumkan publik oleh penyelenggaranya, jadi tidak ada yang "dirahasiakan"
 * dari database. Yang diatur hanya urutan pengalaman: tamu melihat cukup untuk
 * tahu acaranya layak dibuka — dan mesin pencari punya cukup teks untuk
 * mengindeksnya — lalu masuk untuk sisanya. Tamu dan mesin pencari melihat
 * halaman yang SAMA (bukan cloaking).
 */

/**
 * ±2 kalimat: cukup untuk menilai relevansi (dan di atas 155 karakter yang
 * sudah tampil di pratinjau tautan), terlalu pendek untuk menggantikan
 * halaman lengkap.
 */
export const GUEST_TEASER_CHARS = 200;

export interface Teaser {
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * Cuplikan deskripsi untuk tamu. Dipotong di batas kata (bukan di tengah
 * kata), dihitung per karakter Unicode — emoji tidak terbelah jadi kotak rusak —
 * dan tanda baca di ujung potongan dibuang sebelum elipsis.
 */
export function teaserOf(text: string | null | undefined, max = GUEST_TEASER_CHARS): Teaser | null {
  const clean = (text ?? '').trim();
  if (!clean) return null;
  const chars = Array.from(clean);
  if (chars.length <= max) return { text: clean, truncated: false };

  const cut = chars.slice(0, max).join('');
  const atWord = cut.replace(/\s+\S*$/u, '');
  // Satu kata raksasa (tautan panjang) di awal: lebih baik terpotong daripada nyaris kosong.
  const body = Array.from(atWord).length >= max * 0.6 ? atWord : cut;
  return { text: `${body.replace(/[\s,.;:!?—–-]+$/u, '')}…`, truncated: true };
}
