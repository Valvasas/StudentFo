import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Antrean moderasi tidak pernah boleh masuk indeks pencarian.
      // /events/*/daftar: pengalih keluar yang mencatat klik (ADR-032) —
      // crawler yang mengikutinya menggelembungkan sinyal rekomendasi.
      disallow: ['/admin', '/profile', '/auth/', '/events/*/daftar'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
