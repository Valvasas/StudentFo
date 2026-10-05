import Link from 'next/link';
import { SearchBox } from '@/components/listing/listing-ui';
import { Button } from '@/components/ui/button';
import { LostMapSketch } from '@/components/ui/illustrations';
import { HandNote } from '@/components/ui/sketch';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';
import { parseEventQuery } from '@/lib/search-params';

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
      <HandNote className="mt-6 text-[19px]">eh, rutenya buntu</HandNote>
      <h1 className="mt-2 text-[clamp(28px,5vw,40px)]">Halaman ini tidak ada</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        Mungkin kegiatannya sudah ditarik penyelenggara, atau tautannya salah ketik. Coba cari judulnya, atau mulai
        dari jenis kegiatan yang kamu incar.
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
