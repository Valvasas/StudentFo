/**
 * Riwayat kartu yang dilewati (ADR-058). Urutan = urutan dilewati, sehingga
 * "Urungkan" selalu mengembalikan yang terakhir. Tidak ada yang dikirim ke
 * server: daftar ini hanya hidup di tab ini (sessionStorage).
 *
 * Riwayat bisa memuat orang yang tak ada di daftar saat ini (saringan lain,
 * halaman "tampilkan lagi"). Mereka TETAP disimpan — kembali ke saringan
 * semula harus tetap menyembunyikannya — tetapi tidak dihitung dan tidak
 * dipulihkan dari tampilan yang tak memuat mereka (`present`).
 */

export const SKIP_STORE_MAX = 48;

export type SkipHistory = readonly string[];

export function visibleSlides<T extends { readonly id: string }>(slides: readonly T[], skipped: SkipHistory): readonly T[] {
  if (skipped.length === 0) return slides;
  const hidden = new Set(skipped);
  return slides.filter((slide) => !hidden.has(slide.id));
}

export function skip(history: SkipHistory, id: string): SkipHistory {
  return history.includes(id) ? history : [...history, id];
}

export function presentIn(history: SkipHistory, present: ReadonlySet<string>): SkipHistory {
  return history.filter((id) => present.has(id));
}

/** Mengembalikan yang terakhir dilewati DI ANTARA yang ada di tampilan ini. */
export function undo(history: SkipHistory, present: ReadonlySet<string>): { readonly history: SkipHistory; readonly restored: string | null } {
  let index = history.length - 1;
  while (index >= 0 && !present.has(history[index] ?? '')) index -= 1;
  if (index < 0) return { history, restored: null };
  return { history: [...history.slice(0, index), ...history.slice(index + 1)], restored: history[index] ?? null };
}

export function restoreAll(history: SkipHistory, present: ReadonlySet<string>): SkipHistory {
  return history.filter((id) => !present.has(id));
}

const ID_MAX = 64;

/**
 * Baca nilai sessionStorage yang tidak dipercaya: JSON rusak, bentuk lain,
 * nilai yang bukan id, dan duplikat dibuang tanpa melempar. Id yang tidak ada
 * di daftar saat ini dipertahankan (lihat atas); id asing hanya tak cocok
 * dengan kartu mana pun. Bila lebih dari `SKIP_STORE_MAX`, yang terbaru
 * dipertahankan.
 */
export function parseSkipStore(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string' || entry === '' || entry.length > ID_MAX || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
  }
  return ids.slice(-SKIP_STORE_MAX);
}

export function serializeSkipStore(ids: SkipHistory): string {
  return JSON.stringify(ids.slice(-SKIP_STORE_MAX));
}
