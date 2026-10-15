import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Hero beranda tamu. Tombol utama membuka katalog, bukan pendaftaran akun:
 * mencari tidak butuh akun, dan meminta daftar sebelum pengunjung melihat
 * isinya adalah gesekan terbesar di corong ini.
 */
export function LandingHero() {
  return (
    <section className="container-page flex flex-col items-center pt-[clamp(48px,9vw,104px)] text-center">
      <div className="enter flex flex-col items-center [animation-duration:700ms]">
        <h1 className="max-w-[17ch] text-[clamp(38px,6.6vw,64px)] leading-[1.05] tracking-[-0.04em]">
          Lomba, beasiswa, dan magang dari <span className="marker">sumber yang jelas</span>.
        </h1>
        <p className="mt-6 max-w-[52ch] text-[clamp(16.5px,2vw,19px)] leading-relaxed text-ink-muted">
          Satu katalog untuk siswa SMA/SMK dan mahasiswa — setiap kegiatan ditinjau sebelum tayang, lengkap dengan tautan
          resmi dan sisa waktu pendaftarannya.
        </p>
        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Link
            href="/events"
            className="flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-[22px] text-[15px] font-semibold text-on-brand transition-colors duration-200 ease-snap hover:bg-brand-hover"
          >
            Jelajahi kegiatan
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link
            href="/register"
            className="press flex h-12 items-center justify-center rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
          >
            Buat akun
          </Link>
        </div>
      </div>
    </section>
  );
}
