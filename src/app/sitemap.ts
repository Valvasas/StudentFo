import type { MetadataRoute } from 'next';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { MAX_PAGE_SIZE } from '@/lib/data/repository';
import type { EventSummary } from '@/types/domain';

// Protokol sitemap membatasi 50.000 URL per berkas. Dipasang sebagai jaga-jaga
// keras di loop paginasi di bawah — bukan supaya dicapai, tapi supaya satu bug
// di `totalPages` (data korup, dsb.) tidak membuat loop ini jalan tanpa henti.
const MAX_SITEMAP_ENTRIES = 50_000;

/**
 * Sitemap dinamis.
 *
 * PENTING: paginasi di sini WAJIB `sort: 'newest'`, bukan default
 * ('relevance'). Sort relevance di SupabaseEventRepository membatasi diri ke
 * RANKING_CANDIDATE_LIMIT (500) baris kandidat karena skoringnya berjalan di
 * app, bukan di SQL — jadi memakainya di sini akan memotong sitemap lagi
 * persis seperti bug yang sedang diperbaiki, hanya lewat jalur berbeda.
 * 'newest' tetap paginasi murni di database, jadi aman di skala berapa pun.
 *
 * Kegagalan di sini TIDAK boleh menjatuhkan build atau mengembalikan 500 —
 * crawler yang menerima error berulang akan menurunkan frekuensi kunjungan.
 * Kalau database sedang bermasalah, lebih baik menyajikan rute statis saja
 * daripada tidak menyajikan apa pun.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/tracker`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const repository = await getEventRepository();
    const events: EventSummary[] = [];

    // Sebelumnya berhenti di halaman pertama (48 event) — begitu jumlah
    // event APPROVED/EXPIRED lewat itu, sisanya diam-diam tidak pernah
    // masuk sitemap dan tidak pernah ter-index Google. Sekarang ditarik
    // sampai halaman terakhir yang dilaporkan `totalPages`.
    let page = 1;
    let totalPages = 1;
    do {
      const result = await repository.listEvents({
        page,
        pageSize: MAX_PAGE_SIZE,
        includeClosed: true,
        sort: 'newest',
      });
      events.push(...result.items);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && events.length < MAX_SITEMAP_ENTRIES);

    return [
      ...staticRoutes,
      ...events.map((event) => ({
        url: `${siteUrl}/events/${event.slug}`,
        lastModified: new Date(event.createdAt),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
