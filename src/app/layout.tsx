import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { DemoBanner } from '@/components/layout/demo-banner';
import { LegalUpdateBanner } from '@/components/legal/legal-update-banner';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { ViewTransitionBridge } from '@/components/ui/transition-link';
import { SiteBackdrop } from '@/components/layout/site-backdrop';
import { ThemeScript } from '@/components/layout/theme-script';
import { LogoSprite } from '@/components/ui/logo';
import { PopoverDismiss } from '@/components/ui/popover-dismiss';
import { SearchShortcut } from '@/components/ui/search-shortcut';
import { siteUrl } from '@/lib/env';
import { OPEN_GRAPH_BASE } from '@/lib/seo';
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

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // ≤ 60 karakter: judul lebih panjang dipotong di hasil pencarian.
    default: 'StudentFo — Info lomba, beasiswa & magang dalam satu tempat',
    template: '%s · StudentFo',
  },
  // ≤ 155 karakter: lebih panjang dipotong di hasil pencarian, tepat di klaim pentingnya.
  description: 'Info lomba, beasiswa, magang & workshop untuk pelajar SMA/SMK dan mahasiswa Indonesia. Ditinjau moderator, bisa disaring, lengkap sisa waktu daftar.',
  // Nama di bawah ikon layar utama iOS; tanpa ini iOS memakai judul halaman yang terpotong.
  // `capable: false` eksplisit: bawaan Next `true` membuka pintasan tanpa bilah
  // browser = tanpa tombol kembali (alasan yang sama dengan `display` di manifest.ts).
  appleWebApp: { title: 'StudentFo', capable: false },
  openGraph: { ...OPEN_GRAPH_BASE, type: 'website' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // suppressHydrationWarning: atribut data-theme sengaja diubah oleh
    // ThemeScript sebelum React jalan, jadi ketidakcocokan di elemen INI
    // memang diharapkan dan hanya di sini.
    <html lang="id" suppressHydrationWarning className={`${jakarta.variable} ${bricolage.variable} ${geistMono.variable}`}>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#konten" className="skip-link rounded-card bg-brand px-4 py-2 text-on-brand">
          Lompat ke konten utama
        </a>
        <LogoSprite />
        {/* Suspense: `useSearchParams` di dalamnya; tanpa batas ini seluruh
            layout ikut ditunda sampai parameter tersedia di klien. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <ViewTransitionBridge />
        <SiteBackdrop />
        <DemoBanner />
        <LegalUpdateBanner />
        <Navbar />
        <main id="konten" className="flex-1">
          {children}
        </main>
        <Footer />
        <SearchShortcut />
        <PopoverDismiss />
      </body>
    </html>
  );
}
