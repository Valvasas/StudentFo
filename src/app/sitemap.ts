import type { MetadataRoute } from 'next';
import { getEventRepository } from '@/lib/data';
import { SITEMAP_EVENT_LIMIT } from '@/lib/data/repository';
import { siteUrl } from '@/lib/env';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';

/**
 * Sitemap dinamis (ADR-097).
 *
 * - Kegiatan: hanya yang MASIH BISA DIDAFTARI. Yang sudah tutup tetap bisa
 *   dibuka (200 + "Pendaftaran ditutup", bukan 404 — DEVIATIONS #12) dan
 *   tetap terindeks lewat tautan, tetapi tidak lagi disodorkan untuk
 *   dirayapi ulang. `<lastmod>` = perubahan ISI (`touch_event_updated_at`),
 *   bukan setiap simpanan — nilai yang terbukti tidak akurat membuat Google
 *   mengabaikan `<lastmod>` seluruh situs.
 * - Lima halaman kategori ikut disetor: itu halaman tujuan kata kunci
 *   "info lomba", "beasiswa", "lowongan magang", dengan canonical sendiri.
 *
 * Kegagalan di sini TIDAK boleh menjatuhkan build atau mengembalikan 500 —
 * crawler yang menerima error berulang akan menurunkan frekuensi kunjungan.
 * Kalau database sedang bermasalah, lebih baik menyajikan rute statis saja.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: 'daily', priority: 0.9 },
    ...EVENT_TYPE_NAV.map((item) => ({
      url: `${siteUrl}${eventTypeHref(item)}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    { url: `${siteUrl}/teams`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${siteUrl}/connections`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${siteUrl}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/penyelenggara`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/submit`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/tracker`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${siteUrl}/sumber-data`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/privacy-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/cookie-policy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  try {
    const events = await (await getEventRepository()).listSitemapEvents(SITEMAP_EVENT_LIMIT);
    return [
      ...staticRoutes,
      ...events.map((event) => ({
        url: `${siteUrl}/events/${event.slug}`,
        lastModified: new Date(event.updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error('[sitemap] kegiatan gagal dimuat, hanya rute statis:', error);
    return staticRoutes;
  }
}
