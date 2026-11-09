import { GraduationCap, MapPin, School } from 'lucide-react';
import { isCampusKind } from '@/lib/institution-kinds';
import type { StudyPlaceView } from '@/lib/study-profile';
import { cn } from '@/lib/utils';

/**
 * "Universitas Indonesia (UI) · Kota Depok, Jawa Barat" + bidang spesifik
 * (ADR-075/076). Dipakai profil publik, pratinjau profil sendiri, lobi, dan
 * kartu koneksi — satu bentuk supaya orang belajar membacanya sekali.
 * Tempat studi DIISI SENDIRI: tidak diberi tanda "terverifikasi".
 */
export function StudyPlaceLine({ view, withFields = false, className }: { view: StudyPlaceView; withFields?: boolean; className?: string }) {
  const Icon = view.kind && !isCampusKind(view.kind) ? School : GraduationCap;
  if (!view.institution && !view.region && (!withFields || view.fields.length === 0)) return null;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(view.institution || view.region) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-soft">
          {view.institution && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="sr-only">Tempat studi: </span>
              <span className="min-w-0 break-words">{view.institution}</span>
            </span>
          )}
          {view.region && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="sr-only">Domisili: </span>
              {view.region}
            </span>
          )}
        </p>
      )}
      {withFields && view.fields.length > 0 && (
        <ul aria-label="Bidang peminatan spesifik" className="flex flex-wrap gap-1.5">
          {view.fields.map((label) => (
            <li key={label} className="flex min-h-[26px] items-center rounded-sm border border-line px-2 text-[12.5px] text-ink-soft">
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
