import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/listing/listing-ui';
import { Button } from '@/components/ui/button';
import { LostMapSketch } from '@/components/ui/illustrations';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';
import { NOT_FOUND_TITLE } from '@/lib/page-title';
import { parseEventQuery } from '@/lib/search-params';

export const metadata: Metadata = {
  title: NOT_FOUND_TITLE,
  robots: { index: false, follow: false },
};

/**
 * 404. Penyebab terbanyak di produk ini: tautan kegiatan lama yang dibagikan
 * di grup chat setelah kegiatannya ditarik, atau slug salah ketik. Jalan
 * pulangnya karena itu pencarian + jenis kegiatan — tempat orang itu
 * sebenarnya ingin sampai — bukan hanya tombol ke beranda.
 *
 * Tetap Server Component tanpa data: halaman ini harus murah dan tidak boleh
 * ikut gagal saat repository bermasalah.
 */
export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
      <LostMapSketch className="text-ink" />
      <h1 className="mt-6 text-[clamp(28px,5vw,40px)]">Halaman ini tidak ada</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        Kegiatannya mungkin sudah ditarik, atau tautannya salah ketik. Coba cari judulnya.
      </p>

      <div className="mt-8 flex w-full max-w-md">
        <SearchBox query={parseEventQuery({})} placeholder="Cari judul atau penyelenggara…" />
      </div>

      <nav aria-label="Jenis kegiatan" className="mt-5 flex flex-wrap justify-center gap-2">
        {EVENT_TYPE_NAV.map((item) => (
          <Link
            key={item.key}
            href={eventTypeHref(item)}
            className="inline-flex min-h-11 items-center rounded-pill border border-line bg-panel px-4 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:border-line-strong hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/events">Lihat kegiatan terbuka</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Ke beranda</Link>
        </Button>
      </div>
    </div>
  );
}
