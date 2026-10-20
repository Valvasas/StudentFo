import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /admin sengaja TIDAK disebut: robots.txt dibaca siapa saja, dan
      // menyebutnya memberi tahu di mana panelnya. Halamannya 404 + noindex.
      // /events/*/daftar: pengalih keluar yang mencatat klik (ADR-032) —
      // crawler yang mengikutinya menggelembungkan sinyal rekomendasi.
      // /api/: berkas .ics & endpoint cron — bukan halaman untuk diindeks.
      disallow: ['/profile', '/orang/', '/auth/', '/events/*/daftar', '/penyelenggara', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
