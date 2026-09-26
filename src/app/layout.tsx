import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { DemoBanner } from '@/components/layout/demo-banner';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { ThemeScript } from '@/components/layout/theme-script';
import { siteUrl } from '@/lib/env';
import { NONCE_HEADER } from '@/lib/security-headers';
import './globals.css';

/**
 * Pasangan huruf:
 * - Plus Jakarta Sans untuk judul. Dirancang oleh perancang huruf Indonesia
 *   (Tokotype) untuk identitas kota Jakarta — relevansi kultural yang nyata,
 *   bukan tempelan, dan karakternya lebih tegas daripada geometrik generik.
 * - Inter untuk teks isi. Dioptimalkan untuk ukuran kecil di layar, punya
 *   angka tabular — penting karena halaman ini penuh hitungan hari.
 * `display: swap` supaya teks langsung terbaca dengan huruf cadangan
 * alih-alih menampilkan area kosong sambil menunggu unduhan huruf.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-jakarta',
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
    { media: '(prefers-color-scheme: light)', color: '#faf8f4' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1c22' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // suppressHydrationWarning: atribut data-theme sengaja diubah oleh
    // ThemeScript sebelum React jalan, jadi ketidakcocokan di elemen INI
    // memang diharapkan dan hanya di sini.
    <html lang="id" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
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
