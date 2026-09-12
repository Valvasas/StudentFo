import type { MetadataRoute } from 'next';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { MAX_PAGE_SIZE } from '@/lib/data/repository';

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
    { url: `${siteUrl}/tracker`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const repository = await getEventRepository();
    const result = await repository.listEvents({ pageSize: MAX_PAGE_SIZE, includeClosed: true });

    return [
      ...staticRoutes,
      ...result.items.map((event) => ({
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
