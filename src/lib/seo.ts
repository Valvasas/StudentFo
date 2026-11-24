import { teaserOf } from '@/lib/event-access';
import { eventTypeHref, eventTypeNavFor } from '@/lib/event-type-nav';
import type { EventType } from '@/types/domain';

/**
 * Isian `openGraph` milik layout. Next MENIMPA (bukan menggabung) objek
 * `openGraph` layout begitu halaman menyetelnya sendiri — tanpa ini kartu
 * pratinjau halaman kegiatan kehilangan nama situs & bahasa.
 */
export const OPEN_GRAPH_BASE = { siteName: 'StudentFo', locale: 'id_ID' } as const;

/** Batas tampilan deskripsi di hasil pencarian Google (±155–160 karakter, potong lebih awal = aman). */
export const META_DESCRIPTION_MAX = 155;

/**
 * Canonical `/events` (ADR-097): setiap kombinasi saringan menunjuk ke
 * halaman BERSIH — tab kategori (`/events?type=LOMBA`) bila jenisnya cocok
 * dengan satu tab, selain itu `/events`. Saringan, urutan, halaman, dan kata
 * kunci tetap berupa URL yang bisa dibagikan (CONVENTIONS § filter), tetapi
 * tidak bersaing di indeks dengan judul yang identik.
 */
export function canonicalEventsPath(types: readonly EventType[]): string {
  const nav = eventTypeNavFor(types);
  return nav ? eventTypeHref(nav) : '/events';
}

/**
 * Deskripsi meta dari teks bebas: spasi/baris baru diratakan lalu dipotong
 * di batas kata oleh `teaserOf` (aturan potong yang sama dengan cuplikan tamu).
 * `slice(0, 155)` mentah dulu memotong di tengah kata ("…untuk t").
 */
export function metaDescription(text: string | null | undefined, max = META_DESCRIPTION_MAX): string | null {
  return teaserOf((text ?? '').replace(/\s+/g, ' '), max)?.text ?? null;
}
