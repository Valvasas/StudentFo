import Link from 'next/link';
import { LogoMark } from '@/components/ui/illustrations';

const FOOTER_LINKS = [
  { href: '/about', label: 'Tentang' },
  { href: '/#verifikasi', label: 'Cara verifikasi' },
  { href: '/events', label: 'Semua kegiatan' },
  { href: '/connections', label: 'Koneksi' },
  { href: '/penyelenggara', label: 'Untuk penyelenggara' },
] as const;

const LEGAL_LINKS = [
  { href: '/terms', label: 'Syarat & Ketentuan' },
  { href: '/privacy-policy', label: 'Kebijakan privasi' },
  { href: '/cookie-policy', label: 'Kebijakan cookie' },
] as const;

const linkClass = 'inline-flex min-h-11 items-center text-ink-muted transition-colors duration-150 ease-snap hover:text-ink';

export function Footer() {
  return (
    <footer className="container-page mt-24 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-line pt-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-base font-bold tracking-[-0.03em]">
          <LogoMark className="size-[22px] -rotate-3" />
          StudentFo
        </Link>
        {/* min-h-11: tautan footer berdiri sendiri, bukan tautan di dalam paragraf,
            jadi pengecualian "inline link" WCAG 2.5.5 tidak berlaku di sini. */}
        <nav aria-label="Tautan footer" className="flex flex-wrap gap-x-7 text-sm">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-muted">
        Informasi dikumpulkan dari sumber publik dan diverifikasi manual sebelum tayang. Selalu periksa ulang ke situs resmi penyelenggara sebelum
        mendaftar atau membayar.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[13px]">
        <span className="text-ink-muted">© {new Date().getFullYear()} StudentFo</span>
        <nav aria-label="Dokumen hukum" className="flex flex-wrap gap-x-5">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
