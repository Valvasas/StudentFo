import Link from 'next/link';
import { LogoMark } from '@/components/ui/illustrations';
import { HandNote } from '@/components/ui/sketch';

const FOOTER_LINKS = [
  { href: '/about', label: 'Tentang' },
  { href: '/#verifikasi', label: 'Cara verifikasi' },
  { href: '/events', label: 'Semua kegiatan' },
  { href: '/connections', label: 'Koneksi' },
  { href: '/submit', label: 'Untuk penyelenggara' },
  { href: '/privacy-policy', label: 'Kebijakan privasi' },
] as const;

export function Footer() {
  return (
    <footer className="container-page mt-24 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-line pt-8">
        <span className="flex flex-col">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-base font-bold tracking-[-0.03em]">
            <LogoMark className="size-[22px] -rotate-3" />
            StudentFo
          </Link>
          <HandNote className="-mt-1 text-[16px] text-ink-muted">dicatat rapi untuk pelajar Indonesia</HandNote>
        </span>
        {/* min-h-11: tautan footer berdiri sendiri, bukan tautan di dalam paragraf,
            jadi pengecualian "inline link" WCAG 2.5.5 tidak berlaku di sini. */}
        <nav aria-label="Tautan footer" className="flex flex-wrap gap-x-7 text-sm">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center text-ink-muted transition-colors duration-150 ease-snap hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-[13px] text-ink-muted">© {new Date().getFullYear()} StudentFo</span>
      </div>
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-ink-muted">
        Informasi dikumpulkan dari sumber publik dan diverifikasi manual sebelum tayang. Selalu periksa ulang
        ke situs resmi penyelenggara sebelum mendaftar.
      </p>
    </footer>
  );
}
