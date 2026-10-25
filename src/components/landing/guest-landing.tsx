import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  GraduationCap,
  Link2,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { DeadlineTicker } from '@/components/event/deadline-ticker';
import { EventCard } from '@/components/event/event-card';
import { getEventRepository } from '@/lib/data';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';
import { withFallback } from '@/lib/fallback';
import { cn } from '@/lib/utils';
import { LandingHero, type LandingTypeLink } from './hero';
import { RevealObserver } from './reveal-observer';
import { LandingTour } from './tour';

/**
 * Beranda tamu. Satu tujuan: membawa pengunjung ke katalog — tetapi dengan
 * cerita: apa ini, bagaimana cara kerjanya (tur), untuk siapa, dan kenapa bisa
 * dipercaya. Setiap klaim harus bisa ditunjuk ke perilaku sistem (ADR-039 #4),
 * pratinjau memakai kegiatan sungguhan, dan tidak ada testimoni atau angka
 * pemakaian karangan (ADR-056). Lihat ADR-061 untuk alasan tur & blok pemasaran
 * kembali setelah dipangkas di ADR-056.
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

const FEATURES = [
  { icon: Sparkles, title: 'Urut sesuai minatmu', body: 'Isi minat & jenjang sekali, daftar kegiatan langsung menyesuaikan — dengan alasan kenapa sebuah kegiatan muncul.' },
  { icon: Bell, title: 'Pengingat H-3 & H-1', body: 'Simpan kegiatan, pengingat muncul di lonceng notifikasimu sebelum pendaftarannya tutup.' },
  { icon: ListChecks, title: 'Papan lamaran', body: 'Pantau setiap pendaftaran dari disimpan, mendaftar, sampai diterima — semua di satu papan.' },
  { icon: CalendarPlus, title: 'Masuk kalendermu', body: 'Tambahkan semua tenggat sebuah kegiatan ke Google Calendar atau kalender ponsel dalam sekali ketuk.' },
  { icon: Users, title: 'Cari rekan tim', body: 'Kartu rekan yang keahliannya melengkapi kamu, lengkap dengan skor dan alasan kecocokannya.' },
  { icon: Award, title: 'Portofolio otomatis', body: 'Hasil setiap kegiatan yang kamu ikuti terkumpul jadi portofolio di profilmu.' },
] as const;

const AUDIENCES = [
  {
    icon: BookOpen,
    title: 'Siswa SMA/SMK',
    points: ['Lomba & beasiswa yang terbuka untuk jenjangmu', 'Syarat dicek otomatis dengan jenjang di profil', 'Bisa dipakai tanpa akun'],
    href: '/events?type=BEASISWA',
    cta: 'Lihat beasiswa',
  },
  {
    icon: GraduationCap,
    title: 'Mahasiswa',
    points: ['Magang, lomba tim, dan pelatihan di satu tempat', 'Cari rekan tim lewat pencocokan keahlian', 'Papan lamaran & portofolio'],
    href: '/events?type=MAGANG',
    cta: 'Lihat magang',
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
const TICKER_LIMIT = 10;

const sectionClass = 'container-page max-w-[1120px] pt-[clamp(72px,9vw,112px)]';
const h2Class = 'text-[clamp(28px,4.4vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]';
const eyebrowClass = 'font-mono text-[12px] uppercase tracking-[.12em] text-ink-muted';
const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

export async function GuestLanding() {
  const repository = await getEventRepository();
  const [closingSoon, types] = await Promise.all([
    withFallback('pratinjau tenggat terdekat', () => repository.listClosingSoon(TICKER_LIMIT), []),
    Promise.all(
      EVENT_TYPE_NAV.map(
        async (item): Promise<LandingTypeLink> => ({
          key: item.key,
          label: item.label,
          href: eventTypeHref(item),
          count: await withFallback(`hitungan ${item.label}`, async () => (await repository.listEvents({ types: item.types, pageSize: 1 })).total, null),
        }),
      ),
    ),
  ]);
  const preview = closingSoon.slice(0, PREVIEW_LIMIT);

  return (
    <div className="overflow-x-clip">
      <RevealObserver />
      <LandingHero deck={closingSoon.slice(0, 3)} types={types} />

      {closingSoon.length > 0 && (
        <div className="mt-[clamp(40px,6vw,72px)]">
          <DeadlineTicker events={closingSoon} />
        </div>
      )}

      {preview.length > 0 && (
        <section aria-labelledby="tenggat-title" className={cn(sectionClass, 'pt-[clamp(48px,6vw,72px)]')}>
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
            {preview.map((event, index) => (
              <li key={event.id} className={index === 3 ? 'hidden sm:block' : index > 3 ? 'hidden lg:block' : undefined}>
                <EventCard event={event} returnTo="/" className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="cara-kerja" aria-labelledby="cara-kerja-title" className={`${sectionClass} scroll-mt-20`}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Cara kerja</span>
          <h2 id="cara-kerja-title" className={h2Class}>
            Dari cari sampai daftar, dalam lima langkah.
          </h2>
          <p className="max-w-[48ch] text-[16.5px] leading-relaxed text-ink-muted">
            Tur singkat ini berjalan sendiri. Jeda kapan saja, atau pilih langkah yang ingin kamu lihat.
          </p>
        </div>
        <LandingTour />
      </section>

      <section aria-labelledby="fitur-title" className={sectionClass}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Fitur</span>
          <h2 id="fitur-title" className={h2Class}>
            Biar tidak ada tenggat yang <span className="marker">terlewat</span>.
          </h2>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <li
              key={feature.title}
              data-reveal=""
              style={delay(80 * index)}
              className="flex flex-col gap-3 rounded-[20px] border border-line bg-panel p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-[12px] bg-highlight-soft text-ink">
                <feature.icon aria-hidden className="size-5" />
              </span>
              <span className="text-[17px] font-semibold tracking-[-0.015em]">{feature.title}</span>
              <span className="text-[14.5px] leading-relaxed text-ink-muted">{feature.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="untuk-siapa-title" className={sectionClass}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Untuk siapa</span>
          <h2 id="untuk-siapa-title" className={h2Class}>
            Satu tempat untuk pelajar dan penyelenggara.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {AUDIENCES.map((audience, index) => (
            <article key={audience.title} data-reveal="" style={delay(100 * index)} className="flex flex-col gap-5 rounded-[22px] border border-line bg-panel p-6 sm:p-7">
              <span className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-pill bg-panel-nested">
                  <audience.icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-[20px] font-bold tracking-[-0.02em]">{audience.title}</h3>
              </span>
              <ul className="flex flex-col gap-2.5">
                {audience.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[14.5px] leading-snug text-ink-soft">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href={audience.href}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold underline-offset-[4px] hover:underline"
              >
                {audience.cta} <ArrowRight aria-hidden className="size-4" />
              </Link>
            </article>
          ))}
          <article data-reveal="" style={delay(200)} className="flex flex-col gap-5 rounded-[22px] bg-inverse p-6 text-on-inverse sm:p-7">
            <span className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-pill bg-on-inverse/10">
                <Building2 aria-hidden className="size-5" />
              </span>
              <h3 className="text-[20px] font-bold tracking-[-0.02em] text-on-inverse">Penyelenggara</h3>
            </span>
            <ul className="flex flex-col gap-2.5">
              {['Formulir pendaftaran tanpa Google Form', 'Bukti bayar peserta diperiksa di satu tempat', 'Analitik kunjungan & pendaftar per acara'].map((point) => (
                <li key={point} className="flex gap-2.5 text-[14.5px] leading-snug text-on-inverse-muted">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-on-inverse" strokeWidth={2.4} />
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href="/register?type=organizer"
              className="mt-auto flex h-12 items-center justify-center gap-2 rounded-sm bg-on-inverse px-5 text-[15px] font-semibold text-inverse transition-opacity duration-200 ease-snap hover:opacity-90 sm:self-start"
            >
              Daftar sebagai penyelenggara <ArrowRight aria-hidden className="size-4" />
            </Link>
          </article>
        </div>
      </section>

      <section id="verifikasi" aria-labelledby="verifikasi-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3.5">
            <div data-reveal="" className="flex flex-col gap-3.5">
              <span className={eyebrowClass}>Verifikasi</span>
              <h2 id="verifikasi-title" className={h2Class}>
                Dicek dulu, baru tayang.
              </h2>
              <p className="max-w-[44ch] text-[16.5px] leading-relaxed text-ink-muted">
                Info lomba berbayar dari penyelenggara yang tidak jelas masih sering beredar. Ini yang berlaku untuk setiap
                kegiatan di StudentFo.
              </p>
            </div>
            <ul className="mt-5 flex flex-col border-t border-line">
              {CHECKS.map((check, index) => (
                <li key={check.title} data-reveal="left" style={delay(100 + index * 200)} className="flex gap-4 border-b border-line py-5">
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
          <VerificationVisual />
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

      <section aria-labelledby="cta-title" className={sectionClass}>
        <div data-reveal="scale" className="relative flex flex-col items-start gap-4 overflow-hidden rounded-[24px] bg-inverse px-[clamp(24px,5vw,56px)] py-[clamp(36px,6vw,64px)] text-on-inverse">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-pill bg-highlight/20 blur-2xl" />
          <h2 id="cta-title" className="relative max-w-[20ch] text-[clamp(28px,4vw,42px)] font-bold leading-[1.08] tracking-[-0.03em] text-on-inverse">
            Tenggat berikutnya mungkin minggu ini.
          </h2>
          <p className="relative max-w-[46ch] text-[16.5px] leading-relaxed text-on-inverse-muted">
            Buat akun gratis untuk menyimpan kegiatan, dapat pengingat sebelum tutup, dan pantau semua pendaftaranmu.
          </p>
          <div className="relative mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/register"
              className="flex h-12 items-center justify-center rounded-sm bg-on-inverse px-[22px] text-[15px] font-semibold text-inverse transition-opacity duration-200 ease-snap hover:opacity-90"
            >
              Buat akun gratis
            </Link>
            <Link
              href="/events"
              className="flex h-12 items-center justify-center gap-2 rounded-sm border border-on-inverse/30 px-5 text-[15px] font-semibold text-on-inverse transition-colors duration-200 ease-snap hover:bg-on-inverse/10"
            >
              Lihat dulu tanpa akun <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Kertas pengumuman yang dicap "Terverifikasi" saat terlihat — ilustrasi proses moderasi, bukan klaim angka. */
function VerificationVisual() {
  return (
    <div
      data-reveal="scale"
      style={delay(100)}
      aria-hidden
      className="relative mx-auto aspect-square w-full max-w-[460px] rounded-[24px] bg-panel-nested [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]"
    >
      <div className="absolute left-[12%] top-[10%] flex h-[66%] w-[62%] -rotate-2 flex-col gap-[6%] rounded-[14px] border border-line bg-panel p-[7%] shadow-[0_18px_40px_rgba(0,0,0,.06)]">
        <span className="h-[6%] w-1/2 rounded bg-line" />
        <span className="h-[3.5%] w-4/5 rounded bg-panel-nested" />
        <span className="h-[3.5%] w-3/4 rounded bg-panel-nested" />
        <span className="h-[3.5%] w-2/3 rounded bg-panel-nested" />
        <span className="mt-auto flex items-center gap-[6%]">
          <span className="flex aspect-square w-[14%] items-center justify-center rounded-pill bg-brand text-on-brand">
            <Link2 className="size-1/2" />
          </span>
          <span className="h-[14%] min-h-2 w-1/2 rounded bg-panel-nested" />
        </span>
      </div>
      <div className="absolute bottom-[9%] right-[7%] -rotate-[7deg]">
        <div data-reveal="stamp" style={delay(700)} className="flex items-center gap-3 rounded-[10px] border-2 border-ink bg-panel p-1.5 shadow-[0_10px_24px_rgba(0,0,0,.08)]">
          <div className="flex items-center gap-2.5 rounded-[6px] border border-ink px-3.5 py-2.5">
            <BadgeCheck className="size-[22px]" />
            <div className="flex flex-col gap-0.5 text-left">
              <span className="font-mono text-sm font-medium tracking-[.12em]">TERVERIFIKASI</span>
              <span className="font-mono text-[11px] tracking-[.08em] text-ink-muted">DITINJAU MANUAL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
