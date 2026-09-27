import type { EventType } from '@/types/domain';

export interface EventTypeNavItem {
  /** Jenis yang menentukan tab aktif & tata letak halaman daftar. */
  readonly key: EventType;
  readonly label: string;
  /** Semua jenis yang ikut ditampilkan di halaman ini. */
  readonly types: readonly EventType[];
}

/**
 * Lima tab kategori di navbar (kanvas desain: Lomba, Beasiswa, Magang,
 * Workshop, Seminar).
 *
 * Enum produk punya tujuh jenis; tab tidak menambah enum baru (paritas
 * tiga-tempat, AGENTS.md §2) melainkan memetakan: PELATIHAN ikut tab
 * Workshop karena bentuknya sama (sesi belajar bertiket), KONFERENSI tampil
 * sebagai "Seminar". VOLUNTEER hanya lewat "Semua kegiatan" (/events).
 */
export const EVENT_TYPE_NAV: readonly EventTypeNavItem[] = [
  { key: 'LOMBA', label: 'Lomba', types: ['LOMBA'] },
  { key: 'BEASISWA', label: 'Beasiswa', types: ['BEASISWA'] },
  { key: 'MAGANG', label: 'Magang', types: ['MAGANG'] },
  { key: 'WORKSHOP', label: 'Workshop', types: ['WORKSHOP', 'PELATIHAN'] },
  { key: 'KONFERENSI', label: 'Seminar', types: ['KONFERENSI'] },
];

export function eventTypeHref(item: EventTypeNavItem): string {
  return `/events?${item.types.map((type) => `type=${type}`).join('&')}`;
}

/**
 * Tab yang cocok dengan filter jenis saat ini, atau null kalau filternya
 * campuran/kosong — halaman daftar lalu memakai tata letak umum.
 */
export function eventTypeNavFor(types: readonly EventType[] | undefined): EventTypeNavItem | null {
  if (!types || types.length === 0) return null;
  const sorted = [...types].sort().join(',');
  return EVENT_TYPE_NAV.find((item) => [...item.types].sort().join(',') === sorted) ?? null;
}
