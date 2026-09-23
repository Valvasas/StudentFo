import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

const FOOTER_LINKS = [
  { href: '/events', label: 'Jelajahi kegiatan' },
  { href: '/events?type=BEASISWA', label: 'Beasiswa terbuka' },
  { href: '/events?type=MAGANG', label: 'Lowongan magang' },
  { href: '/tracker', label: 'Tracker lamaran' },
] as const;

export function Footer() {
  return (
    <footer className="mt-16 bg-inverse text-on-inverse">
      <div className="container-page flex flex-col gap-8 py-10 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-sm">
          <p className="flex items-center gap-2 font-display text-base font-semibold">
            <GraduationCap aria-hidden className="size-5 text-brand-text" />
            StudentFo
          </p>
          <p className="mt-3 text-sm leading-relaxed text-on-inverse-muted">
            Agregator informasi lomba, beasiswa, magang, dan kegiatan pengembangan untuk pelajar dan
            mahasiswa di Indonesia.
          </p>
        </div>

        {/* min-h-11: tautan footer berdiri sendiri, bukan tautan di dalam paragraf,
            jadi pengecualian "inline link" WCAG 2.5.5 tidak berlaku di sini. */}
        <nav aria-label="Tautan footer" className="flex flex-col text-sm lg:flex-row lg:gap-6">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center text-on-inverse-muted transition-colors duration-150 ease-snap hover:text-on-inverse"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-inverse-nested">
        <div className="container-page py-4">
          <p className="text-xs leading-relaxed text-on-inverse-muted">
            Informasi dikumpulkan dari sumber publik dan diverifikasi manual sebelum tayang. Selalu
            periksa ulang ke situs resmi penyelenggara sebelum mendaftar.
          </p>
        </div>
      </div>
    </footer>
  );
}
