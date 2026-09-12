import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
      <Compass aria-hidden className="size-10 text-ink-faint" />
      <h1 className="text-3xl">Halaman ini tidak ada</h1>
      <p className="max-w-md text-ink-muted">
        Mungkin kegiatannya sudah dihapus, atau tautannya salah ketik. Coba mulai dari daftar
        kegiatan yang sedang terbuka.
      </p>
      <Button asChild className="mt-2">
        <Link href="/events">Lihat kegiatan terbuka</Link>
      </Button>
    </div>
  );
}
