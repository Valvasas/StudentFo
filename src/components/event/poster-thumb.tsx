import Image from 'next/image';
import { photoSrc } from '@/components/event/event-photo';
import { cn } from '@/lib/utils';
import type { EventPoster } from '@/types/domain';

/**
 * Thumbnail poster di kartu & papan kegiatan (ADR-079): kecil, berproporsi
 * tetap 4:5, di samping judul — hierarki judul → tenggat tidak bergeser, dan
 * kartu tanpa poster tidak diberi gambar pengganti. Hiasan: judul sudah jadi
 * nama tautan kartu, jadi alt kosong (pembaca layar tidak membaca dua kali).
 */
export function PosterThumb({ poster, className }: { poster: EventPoster | null | undefined; className?: string }) {
  if (!poster) return null;
  return (
    <span
      data-poster-thumb
      className={cn('relative block aspect-[4/5] w-[72px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-panel-nested sm:w-20', className)}
    >
      <Image src={photoSrc(poster.id)} alt="" width={poster.width} height={poster.height} sizes="80px" className="absolute inset-0 size-full object-cover" />
    </span>
  );
}
