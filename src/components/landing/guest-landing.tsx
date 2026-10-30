import Link from 'next/link';
import { ArrowRight, CalendarClock, Link2, Plus, ShieldCheck } from 'lucide-react';
import { EventCard } from '@/components/event/event-card';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { cn } from '@/lib/utils';
import { LandingHero } from './hero';
import { RevealObserver } from './reveal-observer';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import type { RawSearchParams } from '@/lib/search-params';

/**
 * Beranda tamu. Satu tujuan: membawa pengunjung ke katalog. Pratinjaunya
 * kegiatan sungguhan dari repository (bukan tangkapan antarmuka buatan), dan
 * setiap klaim di halaman ini harus bisa ditunjuk ke perilaku sistem — klaim
 * pemasaran yang tidak bisa dipertanggungjawabkan adalah kerugian nyata bagi
 * yang mempercayainya (ADR-039 #4).
 */
const CHECKS = [
  {
    icon: Link2,
    title: 'Tautan ke sumber resmi',
    body: 'Setiap kegiatan menautkan pengumuman aslinya, jadi kamu bisa memastikan langsung ke penyelenggara.',
  },
  {
    icon: ShieldCheck,
    title: 'Ditinjau moderator',
    body: 'Setiap kegiatan dicocokkan dengan sumbernya. Tidak ada yang tayang tanpa persetujuan.',
  },
  {
    icon: CalendarClock,
    title: 'Sisa waktu selalu terkini',
    body: 'Sisa hari dihitung ulang setiap kali halaman dibuka, dalam zona waktu WIB.',
  },
] as const;

const FAQS = [
  {
    q: 'Apakah StudentFo berbayar?',
    a: 'Tidak untuk pelajar. Mencari, menyimpan, pengingat, dan papan lamaran gratis. Kalau sebuah kegiatan memungut biaya pendaftaran, biaya itu ditetapkan dan diterima langsung oleh penyelenggaranya.',
  },
  {
    q: 'Bagaimana cara mendaftar ke sebuah kegiatan?',
    a: 'Sebagian kegiatan menerima pendaftaran lewat formulir di StudentFo. Sisanya diarahkan ke situs resmi penyelenggara — tautannya selalu ada di halaman kegiatan.',
  },
  {
    q: 'Bagaimana kalau ada kegiatan palsu?',
    a: 'Setiap kegiatan ditinjau manual dan menautkan sumber aslinya. Kalau menemukan yang janggal, periksa tautan sumber di halaman detail sebelum membayar atau mengirim data apa pun.',
  },
  {
    q: 'Seakurat apa tanggal tenggatnya?',
    a: 'Tanggal diambil dari pengumuman resmi saat ditinjau. Tetap cek ulang ke situs penyelenggara sebelum mendaftar.',
  },
  {
    q: 'Saya siswa SMA, bisa ikut?',
    a: 'Bisa. Banyak lomba dan beasiswa terbuka untuk SMA/SMK. Pilih jenjangmu di profil supaya daftar kegiatanmu menyesuaikan.',
  },
] as const;

const PREVIEW_LIMIT = 6;

const sectionClass = 'container-page max-w-[1120px] pt-[clamp(72px,9vw,112px)]';
const h2Class = 'text-[clamp(28px,4.4vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]';

export async function GuestLanding({ params = {} }: { params?: RawSearchParams }) {
  const closingSoon = await withFallback(
    'pratinjau tenggat terdekat',
    async () => (await getEventRepository()).listClosingSoon(PREVIEW_LIMIT),
    [],
  );

  return (
    <div className="overflow-x-clip">
      <RevealObserver />
      {/* Satu-satunya notice yang mendarat di sini: akun baru saja dihapus (ADR-061). */}
      <ActionFeedback params={params} className="container-page max-w-[1120px] pt-6" />
      <LandingHero />

      {closingSoon.length > 0 && (
        <section aria-labelledby="tenggat-title" className={cn(sectionClass, 'pt-[clamp(56px,7vw,88px)]')}>
          <div className="flex items-end justify-between gap-4">
            <h2 id="tenggat-title" className="text-[clamp(22px,3vw,28px)] font-bold tracking-[-0.025em]">
              Segera ditutup
            </h2>
            <Link
              href="/events?sort=deadline"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[14.5px] font-semibold text-ink-soft transition-colors duration-150 ease-snap hover:text-ink"
            >
              Lihat semua <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {/* 3 kartu di ponsel, 4 di dua kolom, 6 di tiga kolom: baris yang
              terisi penuh di setiap lebar, tanpa enam layar gulir di ponsel. */}
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {closingSoon.map((event, index) => (
              <li key={event.id} className={index === 3 ? 'hidden sm:block' : index > 3 ? 'hidden lg:block' : undefined}>
                <EventCard event={event} returnTo="/" className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="verifikasi" aria-labelledby="verifikasi-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div data-reveal="" className="flex flex-col gap-3.5">
            <h2 id="verifikasi-title" className={h2Class}>
              Dicek dulu, baru tayang.
            </h2>
            <p className="max-w-[42ch] text-[16.5px] leading-relaxed text-ink-muted">
              Info lomba berbayar dari penyelenggara yang tidak jelas masih sering beredar. Ini yang berlaku untuk setiap
              kegiatan di StudentFo.
            </p>
          </div>
          <ul data-reveal="" className="flex flex-col border-t border-line">
            {CHECKS.map((check) => (
              <li key={check.title} className="flex gap-4 border-b border-line py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-panel-nested">
                  <check.icon aria-hidden className="size-[18px]" />
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="text-base font-semibold tracking-[-0.01em]">{check.title}</span>
                  <span className="text-[14.5px] leading-normal text-ink-muted">{check.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid items-start gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div data-reveal="" className="flex flex-col gap-3.5">
            <h2 id="faq-title" className={h2Class}>
              Pertanyaan umum
            </h2>
            <p className="max-w-[34ch] text-base leading-relaxed text-ink-muted">
              Tahu kegiatan yang belum ada di sini?{' '}
              <Link href="/submit" className="text-ink underline underline-offset-[3px]">
                Kirimkan ke kami
              </Link>{' '}
              untuk ditinjau.
            </p>
          </div>
          {/* <details> supaya tetap bisa dibuka tanpa JavaScript dan dibacakan
              sebagai kontrol yang bisa diperluas oleh pembaca layar. */}
          <div data-reveal="" className="flex flex-col border-t border-line">
            {FAQS.map((faq, index) => (
              <details key={faq.q} name="faq" open={index === 0} className="group border-b border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16.5px] font-semibold tracking-[-0.015em] [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <Plus aria-hidden className="size-[18px] shrink-0 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-45" />
                </summary>
                <p className="enter pb-6 pr-10 text-[15px] leading-relaxed text-ink-muted [animation-duration:450ms]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-title" className={`${sectionClass} grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]`}>
        <div data-reveal="" className="flex flex-col items-start gap-4 rounded-[20px] bg-inverse px-[clamp(24px,5vw,48px)] py-[clamp(32px,5vw,48px)] text-on-inverse">
          <h2 id="cta-title" className="max-w-[20ch] text-[clamp(26px,3.6vw,36px)] font-bold leading-[1.1] tracking-[-0.03em] text-on-inverse">
            Tenggat berikutnya mungkin minggu ini.
          </h2>
          <p className="max-w-[44ch] text-[16px] leading-relaxed text-on-inverse-muted">
            Simpan kegiatan yang kamu incar dan dapatkan pengingat sebelum pendaftarannya ditutup.
          </p>
          <Link
            href="/register"
            className="mt-2 flex h-12 items-center rounded-sm bg-on-inverse px-[22px] text-[15px] font-semibold text-inverse transition-opacity duration-200 ease-snap hover:opacity-90"
          >
            Buat akun
          </Link>
        </div>
        <div data-reveal="" className="flex flex-col items-start gap-4 rounded-[20px] border border-line bg-panel px-[clamp(24px,4vw,40px)] py-[clamp(32px,5vw,48px)]">
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.025em]">Untuk penyelenggara</h2>
          <p className="max-w-[40ch] text-[15.5px] leading-relaxed text-ink-muted">
            Buat formulir pendaftaran, terima bukti pembayaran peserta, dan kelola pendaftar dari satu studio.
          </p>
          <Link
            href="/penyelenggara"
            className="press mt-auto flex h-12 items-center gap-2 rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
          >
            Buka studio penyelenggara <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
