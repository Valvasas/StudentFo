import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Caveat, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { DemoBanner } from '@/components/layout/demo-banner';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { ThemeScript } from '@/components/layout/theme-script';
import { siteUrl } from '@/lib/env';
import { NONCE_HEADER } from '@/lib/security-headers';
import './globals.css';

/**
 * Tipografi "buku sketsa" (ADR-052, menggantikan Geist dari ADR-039):
 *  - Plus Jakarta Sans — teks isi. Huruf humanis buatan foundry Indonesia
 *    (Tokotype); bentuknya lebih ramah dari grotesk teknis, x-height tinggi
 *    sehingga tetap terbaca di 14px layar ponsel murah.
 *  - Bricolage Grotesque — judul. Grotesk berkarakter (sudut sedikit
 *    "tergambar", sumbu optical size) yang memberi kepribadian tanpa
 *    terlihat main-main.
 *  - Caveat — tulisan tangan, HANYA untuk anotasi kecil (catatan pinggir,
 *    label coretan). Dipakai di judul/teks panjang, ia berubah dari "santai"
 *    jadi "tidak serius".
 *  - Geist Mono — angka hitung mundur & kode (tabular).
 * Semuanya dihosting sendiri oleh next/font (CSP `font-src 'self'`).
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-caveat',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'StudentFo — Info lomba, beasiswa, dan magang dalam satu tempat',
    template: '%s · StudentFo',
  },
  description:
    'Kumpulan informasi lomba, beasiswa, magang, workshop, dan kegiatan pengembangan untuk pelajar dan mahasiswa Indonesia. Tervalidasi manual, bisa difilter, dan selalu menampilkan sisa waktu pendaftaran.',
  keywords: ['lomba mahasiswa', 'beasiswa', 'magang', 'workshop', 'kompetisi pelajar'],
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'StudentFo',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#15140f' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // suppressHydrationWarning: atribut data-theme sengaja diubah oleh
    // ThemeScript sebelum React jalan, jadi ketidakcocokan di elemen INI
    // memang diharapkan dan hanya di sini.
    <html lang="id" suppressHydrationWarning className={`${jakarta.variable} ${bricolage.variable} ${caveat.variable} ${geistMono.variable}`}>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#konten" className="skip-link rounded-card bg-brand px-4 py-2 text-on-brand">
          Lompat ke konten utama
        </a>
        {/* Suspense: `useSearchParams` di dalamnya; tanpa batas ini seluruh
            layout ikut ditunda sampai parameter tersedia di klien. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <DemoBanner />
        <Navbar />
        <main id="konten" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
