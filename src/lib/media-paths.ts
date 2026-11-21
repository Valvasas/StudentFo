/**
 * Halaman media admin (ADR-079) untuk acara tayang yang tidak punya pengelola
 * di StudentFo — mis. hasil kiriman komunitas atau scraping. Studio
 * penyelenggara tidak dibuka untuk admin: tab lain di sana memuat data pribadi
 * pendaftar.
 */
export function adminMediaPath(slug: string, eventId?: string): string {
  const path = `/admin/media/${encodeURIComponent(slug)}`;
  // Kegiatan yang belum tayang tidak ditemukan lewat slug publik; id-nya ikut (ADR-095).
  return eventId ? `${path}?acara=${encodeURIComponent(eventId)}` : path;
}

/** Siapa yang merender form media — menentukan tujuan kembali, bukan hak (hak dicek repository). */
export type MediaContext = 'studio' | 'admin';
