import Link from 'next/link';
import { Lock } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** Bukan pengelola (atau verifikasinya dicabut): penolakan yang jujur, bukan halaman kosong. */
export function NotManaging() {
  return (
    <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
      <Lock aria-hidden className="size-10 text-ink-faint" />
      <h1 className="text-2xl">Acara ini tidak ada di dasbormu</h1>
      <p className="max-w-md text-ink-muted">
        Studio acara hanya untuk penyelenggara terverifikasi yang mengelola acara ini. Klaim acaranya dari tab Penyelenggara
        di halaman acara.
      </p>
      <Link href="/penyelenggara" className={buttonVariants()}>
        Ke studio penyelenggara
      </Link>
    </div>
  );
}
