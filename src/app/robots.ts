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
      // /api/: berkas .ics & endpoint cron — bukan halaman untuk diindeks.
      disallow: ['/admin', '/profile', '/orang/', '/auth/', '/events/*/daftar', '/penyelenggara', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
