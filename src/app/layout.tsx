import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { DemoBanner } from '@/components/layout/demo-banner';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { ThemeScript } from '@/components/layout/theme-script';
import { siteUrl } from '@/lib/env';
import { NONCE_HEADER } from '@/lib/security-headers';
import './globals.css';

/**
 * Geist untuk seluruh teks (kanvas desain ADR-039): tegas seperti Notion
 * tapi tidak kaku, dan punya angka tabular — penting karena halaman ini
 * penuh hitungan hari. Geist Mono untuk angka tahun, kode, dan label kecil
 * berhuruf kapital. `display: swap` supaya teks langsung terbaca dengan huruf
 * cadangan alih-alih area kosong sambil menunggu unduhan huruf.
 */
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111110' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // suppressHydrationWarning: atribut data-theme sengaja diubah oleh
    // ThemeScript sebelum React jalan, jadi ketidakcocokan di elemen INI
    // memang diharapkan dan hanya di sini.
    <html lang="id" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#konten" className="skip-link rounded-card bg-brand px-4 py-2 text-on-brand">
          Lompat ke konten utama
        </a>
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
