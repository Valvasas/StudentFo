import Link from 'next/link';
import { BadgeCheck, CalendarClock, Check, Link2, Plus, ShieldCheck } from 'lucide-react';
import { FeatureCards } from '@/components/landing/feature-cards';
import { LandingHero } from '@/components/landing/hero';
import { RevealObserver } from '@/components/landing/reveal-observer';
import { LandingTour } from '@/components/landing/tour';
import { dataMode } from '@/lib/env';

/**
 * Beranda pemasaran (kanvas desain Landing v2, ADR-039).
 *
 * Isinya statis dan tidak memuat hitungan H-n; dinamisnya halaman ini
 * datang dari CSP bernonce di layout (ADR-027), bukan dari datanya.
 *
 * Salinan kanvas yang mengklaim hal yang belum benar untuk produk ini
 * (daftar lembaga yang "dicek setiap hari", sinkron tiap 6 jam, pengingat
 * H-7, testimoni bernama) disesuaikan dengan perilaku sistem yang
 * sesungguhnya — klaim yang tidak bisa dipertanggungjawabkan di halaman
 * pemasaran adalah kerugian nyata bagi yang mempercayainya.
 */
const SOURCE_KINDS = [
  'Kementerian & lembaga',
  'Perguruan tinggi',
  'Pusat prestasi nasional',
  'Yayasan beasiswa',
  'BUMN & perusahaan',
  'Komunitas terverifikasi',
  'Pemerintah daerah',
  'Kiriman penyelenggara',
] as const;

const CHECKS = [
  {
    icon: Link2,
    title: 'Sumber publik yang bisa dicek',
    body: 'Setiap kegiatan menautkan pengumuman aslinya, jadi kamu selalu bisa memastikan langsung ke penyelenggara.',
  },
  {
    icon: ShieldCheck,
    title: 'Ditinjau manusia sebelum tayang',
    body: 'Hasil pengumpulan otomatis dicocokkan moderator dengan sumbernya. Tidak ada kegiatan yang terbit tanpa persetujuan.',
  },
  {
    icon: CalendarClock,
    title: 'Sisa waktu dihitung ulang',
    body: 'Hitungan hari diperbarui di setiap kunjungan dalam zona waktu WIB, bukan angka yang membeku.',
  },
] as const;

const QUOTES = [
  {
    name: 'Contoh: mahasiswa ilmu komputer',
    mono: 'MK',
    text: '“Dulu tautan lomba saya simpan di catatan ponsel, lalu lupa semuanya. Pengingat sebelum tutup yang bikin berkas saya sempat selesai.”',
  },
  {
    name: 'Contoh: siswa SMA',
    mono: 'SS',
    text: '“Saya tahu soal olimpiade dari sini, lengkap dengan tahapan seleksinya. Tidak perlu tanya ke lima grup WhatsApp lagi.”',
  },
  {
    name: 'Contoh: mahasiswa manajemen',
    mono: 'MM',
    text: '“Sebelum membayar biaya pendaftaran, saya cek dulu sumber aslinya di sini. Ternyata pengumumannya tidak pernah ada.”',
  },
] as const;

const FAQS = [
  {
    q: 'Apakah StudentFo berbayar?',
    a: 'Tidak. Pencarian, simpan, pengingat, dan papan pendaftaran gratis untuk pelajar dan mahasiswa.',
  },
  {
    q: 'Bagaimana kalau ada kegiatan palsu?',
    a: 'Setiap kegiatan ditinjau manual dan menautkan sumber aslinya. Kalau menemukan yang janggal, periksa tautan sumber di halaman detail sebelum membayar atau mengirim data apa pun.',
  },
  {
    q: 'Seakurat apa tanggal tenggatnya?',
    a: 'Tanggal diambil dari pengumuman resmi penyelenggara saat ditinjau. Sisa harinya dihitung ulang di setiap kunjungan dalam zona waktu WIB. Tetap cek ulang ke situs resmi sebelum mendaftar.',
  },
  {
    q: 'Saya siswa SMA, bisa ikut?',
    a: 'Bisa. Banyak lomba dan beasiswa terbuka untuk SMA/SMK. Pilih jenjangmu di profil supaya daftar kegiatanmu menyesuaikan.',
  },
] as const;

const CTA_WORDS = ['Lomba', 'Beasiswa', 'Magang', 'Workshop', 'Seminar'] as const;

const sectionClass = 'container-page max-w-[1120px] pt-[clamp(96px,12vw,144px)]';
const eyebrowClass = 'font-mono text-[13px] text-ink-muted';
const h2Class = 'text-[clamp(32px,5vw,44px)] font-bold leading-[1.08] tracking-[-0.035em]';
const delay = (ms: number) => ({ ['--reveal-delay' as string]: `${ms}ms` });

export default function HomePage() {
  return (
    <div className="overflow-x-clip">
      <RevealObserver />
      <LandingHero />

      <div className="pt-[120px]">
        <div data-reveal="" className="flex flex-col items-center gap-7 border-y border-line py-10">
          <span className="text-[13px] font-medium text-ink-muted">Jenis sumber yang kami kumpulkan</span>
          <div className="w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
            <div aria-hidden className="flex w-max" style={{ animation: 'sf-marquee 52s linear infinite' }}>
              {[...SOURCE_KINDS, ...SOURCE_KINDS].map((kind, index) => (
                <span key={index} className="flex items-center gap-12 whitespace-nowrap pr-12 text-[17px] font-semibold tracking-[-0.02em] text-ink-muted">
                  {kind}
                  <span className="size-1 rounded-pill bg-line-strong" />
                </span>
              ))}
            </div>
            <ul className="sr-only">
              {SOURCE_KINDS.map((kind) => (
                <li key={kind}>{kind}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <section id="cara-kerja" aria-labelledby="cara-kerja-title" className={`${sectionClass} scroll-mt-20`}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Tur singkat</span>
          <h2 id="cara-kerja-title" className={h2Class}>
            Lihat cara pakainya dalam satu menit.
          </h2>
          <p className="text-[17px] leading-relaxed text-ink-muted">
            Pemandu kami menunjukkan alurnya, dari memilih minat sampai mengajak rekan tim. Klik langkah mana pun untuk
            melompat.
          </p>
        </div>
        <LandingTour />
      </section>

      <section id="fitur" aria-labelledby="fitur-title" className={`${sectionClass} scroll-mt-20`}>
        <div data-reveal="" className="flex max-w-[640px] flex-col gap-3.5">
          <span className={eyebrowClass}>Fitur utama</span>
          <h2 id="fitur-title" className={h2Class}>
            Dari cari info sampai berkas siap, semuanya di satu tempat.
          </h2>
        </div>
        <FeatureCards />
      </section>

      <section id="verifikasi" aria-labelledby="verifikasi-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid items-center gap-16 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <div className="flex flex-col gap-3.5">
            <div data-reveal="" className="flex flex-col gap-3.5">
              <span className={eyebrowClass}>Verifikasi</span>
              <h2 id="verifikasi-title" className={h2Class}>
                Setiap kegiatan dicek manual sebelum tayang.
              </h2>
              <p className="max-w-[46ch] text-[17px] leading-relaxed text-ink-muted">
                Lomba berbayar dengan penyelenggara tidak jelas masih sering beredar. Karena itu tiga hal ini berlaku untuk
                setiap kegiatan di StudentFo.
              </p>
            </div>
            <ul className="mt-6 flex flex-col border-t border-line">
              {CHECKS.map((check, index) => (
                <li key={check.title} data-reveal="left" style={delay(100 + index * 220)} className="flex gap-4 border-b border-line py-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-panel-nested">
                    <check.icon aria-hidden className="size-[18px]" />
                  </span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-base font-semibold tracking-[-0.01em]">{check.title}</span>
                    <span className="text-[14.5px] leading-normal text-ink-muted">{check.body}</span>
                  </span>
                  <span aria-hidden className="mt-1.5 flex size-[22px] shrink-0 items-center justify-center rounded-pill bg-brand text-on-brand">
                    <Check className="size-3" strokeWidth={2.4} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            data-reveal="scale"
            style={delay(100)}
            aria-hidden
            className="relative aspect-square w-full rounded-2xl bg-panel-nested [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]"
          >
            <VerificationSheet />
            <div className="absolute bottom-7 right-7 -rotate-[7deg]">
              <div data-reveal="stamp" style={delay(900)} className="flex items-center gap-3 rounded-[10px] border-2 border-brand bg-panel p-1.5">
                <div className="flex items-center gap-2.5 rounded-[6px] border border-brand px-3.5 py-2.5">
                  <BadgeCheck className="size-[22px]" />
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="font-mono text-sm font-medium tracking-[.12em]">TERVERIFIKASI</span>
                    <span className="font-mono text-[11px] tracking-[.08em] text-ink-muted">STUDENTFO · DITINJAU MANUAL</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimoni kanvas desain berisi kutipan orang yang tidak ada. Di
          produksi bagian ini tidak tampil sampai ada kutipan sungguhan
          (dengan izin); di mode data contoh tampil berlabel ilustrasi. */}
      {dataMode === 'seed' && (
        <section aria-labelledby="testimoni-title" className={sectionClass}>
          <h2 id="testimoni-title" data-reveal="" className="text-[32px] font-bold tracking-[-0.03em]">
            Dari pelajar yang sudah mencoba
          </h2>
          <p className="mt-2 text-sm text-ink-muted">Contoh tata letak — kutipan ilustrasi, bukan testimoni sungguhan.</p>
          <div className="mt-12 grid gap-x-10 gap-y-12 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
            {QUOTES.map((quote, index) => (
              <figure key={quote.mono} className="flex flex-col gap-6">
                <div data-reveal="line" style={delay(index * 200)} className="h-px bg-brand" />
                <div data-reveal="" style={delay(index * 200 + 150)} className="flex flex-col gap-6">
                  <blockquote className="text-lg font-medium leading-normal tracking-[-0.015em]">{quote.text}</blockquote>
                  <figcaption className="flex items-center gap-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-panel-nested text-[12.5px] font-semibold">
                      {quote.mono}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{quote.name}</span>
                      <span className="text-[13px] text-ink-muted">Testimoni ilustrasi</span>
                    </span>
                  </figcaption>
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section id="faq" aria-labelledby="faq-title" className={`${sectionClass} scroll-mt-20`}>
        <div className="grid items-start gap-x-20 gap-y-12 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
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
          <div data-reveal="" style={delay(150)} className="flex flex-col border-t border-line">
            {FAQS.map((faq, index) => (
              <details key={faq.q} name="faq" open={index === 0} className="group border-b border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-[22px] text-[17px] font-semibold tracking-[-0.015em] [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <Plus aria-hidden className="size-[18px] shrink-0 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-45" />
                </summary>
                <p className="enter pb-6 pr-10 text-[15.5px] leading-relaxed text-ink-muted [animation-duration:450ms]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-title" className={sectionClass}>
        <div data-reveal="scale" className="relative overflow-hidden rounded-[20px] bg-inverse text-on-inverse">
          <div aria-hidden className="pointer-events-none absolute inset-0 flex select-none flex-col justify-center gap-2">
            {(['sf-marquee 80s', 'sf-marquee-reverse 90s'] as const).map((animation) => (
              <div key={animation} className="flex w-max" style={{ animation: `${animation} linear infinite` }}>
                {[...CTA_WORDS, ...CTA_WORDS].map((word, index) => (
                  <span key={index} className="whitespace-nowrap pr-14 text-[120px] font-bold leading-none tracking-[-0.05em] text-white/[0.06]">
                    {word}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="relative flex flex-col items-center gap-5 px-6 py-[clamp(64px,9vw,96px)] text-center">
            <h2 id="cta-title" className="max-w-[18ch] text-[clamp(34px,5.4vw,48px)] font-bold leading-[1.06] tracking-[-0.04em] text-on-inverse">
              Tenggat berikutnya mungkin minggu ini.
            </h2>
            <p className="max-w-[44ch] text-[17px] leading-relaxed text-on-inverse-muted">
              Buat akun dalam satu menit dan lihat kegiatan yang sesuai dengan minat dan jenjangmu.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="flex h-12 items-center rounded-sm bg-on-inverse px-[22px] text-[15px] font-semibold text-inverse transition-opacity duration-200 ease-snap hover:opacity-90"
              >
                Mulai gratis
              </Link>
              <Link
                href="/submit"
                className="flex h-12 items-center rounded-sm border border-white/25 px-5 text-[15px] font-semibold text-on-inverse transition-colors duration-200 ease-snap hover:bg-white/10"
              >
                Pasang kegiatan sebagai penyelenggara
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Lembar dokumen berstempel — pengganti slot ilustrasi kosong di kanvas. */
function VerificationSheet() {
  return (
    <div className="absolute left-[12%] top-[10%] flex h-[70%] w-[62%] -rotate-2 flex-col gap-[6%] rounded-[12px] border border-line bg-panel p-[7%] shadow-[0_18px_40px_rgba(0,0,0,.06)]">
      <span className="h-[5%] w-1/2 rounded bg-line" />
      <span className="h-[3%] w-4/5 rounded bg-panel-nested" />
      <span className="h-[3%] w-3/4 rounded bg-panel-nested" />
      <span className="h-[3%] w-2/3 rounded bg-panel-nested" />
      <span className="mt-auto flex items-center gap-[6%]">
        <span className="flex aspect-square w-[14%] items-center justify-center rounded-pill bg-brand text-on-brand">
          <Check className="size-1/2" strokeWidth={2.4} />
        </span>
        <span className="h-[14%] min-h-2 w-1/2 rounded bg-panel-nested" />
      </span>
    </div>
  );
}
