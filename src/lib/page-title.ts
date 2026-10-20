/** Judul tab 404, dipakai halaman 404 dan halaman terlarang yang menyamar sebagai 404 (ADR-057). */
export const NOT_FOUND_TITLE = 'Halaman tidak ditemukan';

/** "Bagian · Nama kegiatan" — tab, riwayat peramban, dan pembaca layar perlu membedakan halaman satu dari yang lain. */
export function sectionTitle(section: string, subject: string): string {
  return `${section} · ${subject}`;
}
