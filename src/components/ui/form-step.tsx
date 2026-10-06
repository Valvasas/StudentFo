import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Satu bagian form panjang yang bernomor (Buka tim, Kirim kegiatan — ADR-054/055).
 *
 * Form panjang yang dipecah jadi 3–4 kartu terbaca sebagai "beberapa
 * langkah kecil", bukan satu dinding kolom; nomornya juga memberi tahu
 * seberapa jauh lagi. Tetap SATU `<form>` — tidak ada wizard berhalaman
 * yang butuh JavaScript atau menyimpan setengah isian di server.
 *
 * Judul jangan memakai kata yang juga label kolom ("Penyelenggara", "Judul
 * kegiatan"): `aria-labelledby` bagian ikut dicocokkan `getByLabel` di uji
 * dan oleh alat bantu yang mencari kolom menurut labelnya.
 */
export function FormStep({
  number,
  title,
  hint,
  children,
  className,
}: {
  number: number;
  title: string;
  hint: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`langkah-${number}`}
      className={cn('rise flex min-w-0 flex-col gap-5 rounded-[24px] border border-line bg-panel p-5 sm:p-7', className)}
      style={{ '--i': number } as CSSProperties}
    >
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand font-display text-[15px] font-bold text-on-brand">
          {number}
        </span>
        <span className="flex flex-col gap-0.5">
          <h2 id={`langkah-${number}`} className="text-[19px] font-bold tracking-[-0.02em]">
            <span className="sr-only">Langkah {number}: </span>
            {title}
          </h2>
          <span className="text-[13.5px] text-ink-muted">{hint}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

/** Judul kecil untuk sekelompok pilihan di dalam satu langkah (jenjang, bidang, biaya). */
export function ChoiceGroup({ legend, hint, children, className }: { legend: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <legend className="mb-2.5 flex flex-wrap items-baseline gap-x-2 text-[13.5px] font-semibold">
        {legend}
        {hint && <span className="text-[12.5px] font-normal text-ink-muted">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}
