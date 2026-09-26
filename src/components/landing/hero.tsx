import Link from 'next/link';
import { BadgeCheck, Bell, Clock, GraduationCap, Play } from 'lucide-react';

const ROTATING_WORDS = ['lomba', 'beasiswa', 'magang', 'workshop', 'seminar'] as const;

/**
 * Hero beranda (kanvas desain Landing v2).
 *
 * Kata yang berganti hanya animasi CSS: tanpa JavaScript dan dengan
 * prefers-reduced-motion, keempat kata lain disembunyikan dari tampilan dan
 * dari pembaca layar — `aria-label` di <h1> membawa kalimat utuhnya.
 */
export function LandingHero() {
  return (
    <section className="container-page flex flex-col items-center pt-[clamp(72px,11vw,120px)] text-center">
      <span
        className="flex h-[30px] items-center gap-2 rounded-sm border border-line px-3 text-[13px] font-medium text-ink-muted"
        style={{ animation: 'sf-rise 1s var(--easing-enter) 50ms both' }}
      >
        <GraduationCap aria-hidden className="size-3.5" />
        Untuk siswa SMA/SMK dan mahasiswa
      </span>

      <h1
        aria-label="Info lomba, beasiswa, magang, workshop, dan seminar yang rapi, dari sumber yang jelas."
        className="mt-7 max-w-[16ch] text-[clamp(40px,7.4vw,68px)] leading-[1.04] tracking-[-0.045em]"
        style={{ animation: 'sf-rise 1.1s var(--easing-enter) 180ms both' }}
      >
        <span aria-hidden>
          Info{' '}
          <span className="-mb-[0.1em] inline-grid justify-items-center overflow-hidden px-[0.04em] pb-[0.1em] align-bottom">
            {ROTATING_WORDS.map((word, index) => (
              <span
                key={word}
                // Keyframe terakhir sf-word = tak terlihat; aturan reduced-motion
                // global melompat ke sana. Tanpa `animation: none` di sini,
                // judul jadi "Info ___ yang rapi" bagi yang mematikan animasi.
                className={
                  index === 0
                    ? '[grid-area:1/1] motion-reduce:![animation:none]'
                    : '[grid-area:1/1] motion-reduce:hidden motion-reduce:![animation:none]'
                }
                style={{
                  opacity: index === 0 ? undefined : 0,
                  animation: `sf-word 15s cubic-bezier(.6,0,.2,1) ${index * 3 - 0.6}s infinite both`,
                }}
              >
                {word}
              </span>
            ))}
          </span>{' '}
          yang rapi, dari sumber yang jelas.
        </span>
      </h1>

      <p
        className="mt-6 max-w-[54ch] text-[clamp(17px,2vw,19px)] leading-relaxed text-ink-muted"
        style={{ animation: 'sf-rise 1.1s var(--easing-enter) 320ms both' }}
      >
        StudentFo mengumpulkan lomba, beasiswa, dan magang dari sumber publik ke satu halaman. Pilih minatmu
        sekali, lalu kami ingatkan sebelum pendaftaran ditutup.
      </p>

      <div
        className="mt-10 flex flex-wrap justify-center gap-3"
        style={{ animation: 'sf-rise 1.1s var(--easing-enter) 460ms both' }}
      >
        <Link
          href="/register"
          className="flex h-12 items-center rounded-sm bg-brand px-[22px] text-[15px] font-semibold text-on-brand transition-colors duration-200 ease-snap hover:bg-brand-hover"
        >
          Mulai gratis
        </Link>
        <Link
          href="#cara-kerja"
          className="flex h-12 items-center gap-2 rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
        >
          <Play aria-hidden className="size-3.5 fill-current" />
          Lihat cara pakainya
        </Link>
      </div>
      <p
        className="mt-[18px] text-[13px] text-ink-muted"
        style={{ animation: 'sf-rise 1.1s var(--easing-enter) 560ms both' }}
      >
        Gratis untuk pelajar. Tanpa kartu kredit.
      </p>

      <div
        className="relative mt-20 w-full max-w-[960px]"
        style={{ animation: 'sf-rise 1.4s var(--easing-enter) 700ms both' }}
      >
        <HeroPreview />

        {/* Kartu melayang: hiasan, bukan konten — disembunyikan dari
            pembaca layar dan dari layar < 820px tempat ia menutupi pratinjau. */}
        <div aria-hidden className="pointer-events-none hidden min-[820px]:block">
          <div className="absolute -left-7 top-[14%]" style={{ animation: 'sf-float 7s ease-in-out infinite alternate' }}>
            <div className="flex w-[230px] flex-col items-start gap-2 rounded-[12px] border border-line bg-panel px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.04),0_14px_34px_rgba(0,0,0,.08)]">
              <span className="inline-flex h-[22px] items-center gap-[5px] rounded-[6px] bg-brand px-2 text-[11.5px] font-semibold text-on-brand">
                <Clock className="size-[11px]" />
                Tutup 3 hari lagi
              </span>
              <span className="text-sm font-semibold leading-snug tracking-[-0.01em]">Hackathon Layanan Publik 2026</span>
              <span className="text-[12.5px] text-ink-muted">Contoh kegiatan</span>
            </div>
          </div>
          <div
            className="absolute -right-6 top-[22%]"
            style={{ animation: 'sf-float 8.5s ease-in-out -3s infinite alternate' }}
          >
            <div className="flex items-center gap-2.5 rounded-[12px] border border-line bg-panel py-3 pl-3 pr-4 text-left shadow-[0_1px_2px_rgba(0,0,0,.04),0_14px_34px_rgba(0,0,0,.08)]">
              <span className="flex size-[34px] items-center justify-center rounded-sm bg-panel-nested">
                <BadgeCheck className="size-[18px]" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold">Ditinjau manusia</span>
                <span className="text-[12.5px] text-ink-muted">Sebelum tayang di StudentFo</span>
              </span>
            </div>
          </div>
          <div
            className="absolute bottom-[-26px] right-[14%]"
            style={{ animation: 'sf-float 9.5s ease-in-out -5s infinite alternate' }}
          >
            <div className="flex items-center gap-2.5 rounded-[12px] bg-inverse py-3 pl-3 pr-4 text-left text-on-inverse shadow-[0_18px_40px_rgba(0,0,0,.18)]">
              <span className="flex size-[34px] items-center justify-center rounded-sm bg-inverse-nested">
                <Bell className="size-[17px]" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold">Pengingat H-3 dan H-1</span>
                <span className="text-[12.5px] text-on-inverse-muted">Untuk kegiatan yang kamu simpan</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const PREVIEW_ROWS = [
  { mono: 'HL', title: 'Hackathon Layanan Publik', meta: 'Lomba · Tim 2–4', due: '3 hari lagi', urgent: true },
  { mono: 'BU', title: 'Beasiswa Unggulan Daerah', meta: 'Beasiswa · S1', due: '9 hari lagi', urgent: false },
  { mono: 'MD', title: 'Magang Analis Data', meta: 'Magang · Hybrid', due: '14 hari lagi', urgent: false },
] as const;

/**
 * Pratinjau produk di bingkai 16:7 kanvas. Kanvasnya menyisakan slot
 * ilustrasi kosong; slot kosong berteks "ilustrasi di sini" tidak boleh
 * tayang, jadi diisi potongan antarmuka sungguhan dengan data contoh yang
 * jelas bukan kegiatan nyata. Seluruhnya hiasan (`aria-hidden`).
 */
function HeroPreview() {
  return (
    <div
      aria-hidden
      className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl bg-panel-nested [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]"
    >
      <div className="absolute inset-x-[9%] bottom-0 top-[12%] flex flex-col rounded-t-[14px] border border-b-0 border-line bg-panel p-[3%] text-left shadow-[0_18px_40px_rgba(0,0,0,.06)]">
        <span className="text-[clamp(13px,2vw,20px)] font-bold tracking-[-0.025em]">Info lomba</span>
        <span className="mt-[1.5%] flex gap-[3%] border-b border-line pb-[1.5%] text-[clamp(10px,1.3vw,13px)] font-medium text-ink-muted">
          <span className="text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]">Lomba</span>
          <span>Beasiswa</span>
          <span>Magang</span>
          <span className="hidden sm:inline">Workshop</span>
          <span className="hidden sm:inline">Seminar</span>
        </span>
        {PREVIEW_ROWS.map((row) => (
          <span key={row.mono} className="flex items-center gap-[2%] border-b border-line py-[1.6%]">
            <span className="flex size-[clamp(22px,3.6vw,36px)] shrink-0 items-center justify-center rounded-sm border border-line font-mono text-[clamp(8px,1.1vw,11px)]">
              {row.mono}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[clamp(11px,1.5vw,14.5px)] font-semibold">{row.title}</span>
              <span className="hidden text-[clamp(10px,1.2vw,12.5px)] text-ink-muted xs:inline">{row.meta}</span>
            </span>
            <span
              className={
                row.urgent
                  ? 'flex h-[clamp(18px,2.4vw,24px)] items-center rounded-[6px] bg-brand px-[1.2%] text-[clamp(9px,1.2vw,12px)] font-semibold text-on-brand'
                  : 'text-[clamp(9px,1.2vw,12.5px)] text-ink-muted'
              }
            >
              {row.due}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
