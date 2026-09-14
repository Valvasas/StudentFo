import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-panel">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="font-display text-base font-semibold">StudentFo</p>
          <p className="mt-2 text-sm text-ink-muted">
            Agregator informasi lomba, beasiswa, magang, dan kegiatan pengembangan untuk pelajar dan
            mahasiswa di Indonesia.
          </p>
        </div>

        {/* min-h-11: tautan footer berdiri sendiri, bukan tautan di dalam paragraf,
            jadi pengecualian "inline link" WCAG 2.5.5 tidak berlaku di sini. */}
        <nav aria-label="Tautan footer" className="flex flex-col text-sm">
          <Link href="/events" className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
            Jelajahi kegiatan
          </Link>
          <Link href="/events?type=BEASISWA" className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
            Beasiswa terbuka
          </Link>
          <Link href="/events?type=MAGANG" className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
            Lowongan magang
          </Link>
          <Link href="/tracker" className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
            Tracker lamaran
          </Link>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="container-page py-4">
          <p className="text-xs text-ink-faint">
            Informasi dikumpulkan dari sumber publik dan diverifikasi manual sebelum tayang. Selalu
            periksa ulang ke situs resmi penyelenggara sebelum mendaftar.
          </p>
        </div>
      </div>
    </footer>
  );
}
