import Link from 'next/link';
import { Award, Check } from 'lucide-react';
import { addToPortfolioAction } from '@/app/tracker/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { isPortfolioStatus } from '@/lib/portfolio';
import { cn } from '@/lib/utils';
import type { TrackerStatus } from '@/types/domain';

/**
 * Aksi di halaman kegiatan yang SUDAH TUTUP (ADR-047), menggantikan
 * "Simpan ke Tracker" — menyimpan kegiatan yang tidak bisa lagi diikuti
 * tidak menghasilkan apa-apa, sedangkan mencatat "saya ikut" langsung
 * mengisi portofolio. Tamu diarahkan masuk lewat Server Action yang sama.
 *
 * Sidebar & bilah bawah ponsel memakai komponen ini dengan nama aksesibel
 * yang sama, supaya alur & uji tidak bercabang per lebar layar.
 */
export function PortfolioCta({
  slug,
  trackedStatus,
  compact = false,
  className,
}: {
  slug: string;
  trackedStatus: TrackerStatus | null;
  /** Bilah bawah ponsel: selebar isinya, setinggi tombol lain di bilah itu. */
  compact?: boolean;
  className?: string;
}) {
  const base = cn(
    'flex items-center justify-center gap-2 whitespace-nowrap rounded-card text-sm font-medium transition-colors duration-150 ease-snap',
    compact ? 'h-12 px-4' : 'h-11 w-full px-3',
  );

  if (trackedStatus && trackedStatus !== 'SAVED') {
    const inPortfolio = isPortfolioStatus(trackedStatus);
    return (
      <Link
        href={`/tracker/${slug}${inPortfolio ? '#portofolio-title' : ''}`}
        className={cn(base, 'bg-panel-nested hover:bg-line/60', className)}
      >
        {inPortfolio ? <Award aria-hidden className="size-4" /> : <Check aria-hidden className="size-4" />}
        {inPortfolio ? 'Ada di portofoliomu' : 'Lihat di Pendaftaran'}
      </Link>
    );
  }

  return (
    <form action={addToPortfolioAction} className={className}>
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton className={cn(base, 'border border-line-strong/70 hover:bg-panel-nested')}>
        <Award aria-hidden className="size-4" />
        Saya ikut kegiatan ini
      </SubmitButton>
    </form>
  );
}
