/** "Rani Anggraini" → "RA"; nama satu kata → satu huruf. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Monogram nama grup/kegiatan: huruf awal dua kata pertama yang diawali huruf.
 * `initialsOf` (awal + akhir) cocok untuk nama orang, tapi judul kegiatan
 * hampir selalu berakhir tahun — "Kompetisi … 2026" jadi "K2".
 */
export function monogramOf(title: string): string {
  const words = title.trim().split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  const letters = words.slice(0, 2).map((word) => word[0] ?? '');
  return (letters.join('') || initialsOf(title)).toUpperCase();
}
