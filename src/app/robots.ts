import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Antrean moderasi tidak pernah boleh masuk indeks pencarian.
      disallow: ['/admin', '/profile', '/auth/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
