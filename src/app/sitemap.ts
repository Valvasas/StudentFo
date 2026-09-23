import type { MetadataRoute } from 'next';
import { getEventRepository } from '@/lib/data';
import { MAX_PAGE_SIZE } from '@/lib/data/repository';
import { siteUrl } from '@/lib/env';
import type { EventSummary } from '@/types/domain';

/**
 * Batas atas halaman listing yang ditelusuri (× MAX_PAGE_SIZE = 4.800 URL
 * event). Jauh di bawah batas 50.000 URL per sitemap, dan cukup untuk
 * katalog bertahun-tahun. Melewati angka ini = saatnya memecah sitemap
 * lewat `generateSitemaps()`, bukan menaikkan angka ini.
 */
const MAX_SITEMAP_PAGES = 100;

/**
 * Sitemap dinamis.
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
    { url: `${siteUrl}/teams`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${siteUrl}/submit`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/tracker`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const repository = await getEventRepository();
    // Urutan `newest` (bukan bawaan `relevance`) supaya paging stabil dan
    // setiap event muncul tepat sekali di seluruh halaman.
    const query = { pageSize: MAX_PAGE_SIZE, includeClosed: true, sort: 'newest' as const };
    const first = await repository.listEvents({ ...query, page: 1 });
    const pageCount = Math.min(first.totalPages, MAX_SITEMAP_PAGES);

    const rest = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) => repository.listEvents({ ...query, page: index + 2 })),
    );
    const events: EventSummary[] = [first, ...rest].flatMap((page) => [...page.items]);

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
