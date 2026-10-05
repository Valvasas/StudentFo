import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TINT_BG } from '@/components/ui/avatar';
import { SparkleDoodle } from '@/components/ui/illustrations';
import { HandNote } from '@/components/ui/sketch';
import type { Tint } from '@/lib/tint';
import { cn } from '@/lib/utils';

/**
 * Kepala halaman fitur unggulan (ADR-054): judul besar + kalimat + aksi di
 * kiri, panggung ilustrasi di kanan. Dipakai /teams, /teams/baru, dan
 * /connections supaya ketiganya terasa satu keluarga, bukan tiga templat.
 *
 * Di ponsel panggung turun ke bawah teks dan dibatasi tingginya: yang datang
 * ke halaman kerja ini mencari daftarnya, bukan gambarnya.
 */
export function FeatureHero({
  note,
  title,
  description,
  actions,
  stage,
  children,
  className,
}: {
  /** Catatan pinggir bertulisan tangan di atas judul — satu-satunya di layar. */
  note?: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  stage?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14', className)}>
      <div className="enter flex min-w-0 flex-col gap-5 [animation-duration:900ms]">
        {note && <HandNote className="text-[22px] text-ink-muted">{note}</HandNote>}
        <h1 className="-mt-2 text-[clamp(38px,5.6vw,62px)] leading-[0.98]">{title}</h1>
        <p className="max-w-[50ch] text-[16.5px] leading-relaxed text-ink-muted">{description}</p>
        {actions && <div className="mt-1 flex flex-wrap items-center gap-3">{actions}</div>}
        {children}
      </div>
      {stage && <div className="enter min-w-0 [animation-delay:140ms] [animation-duration:1000ms]">{stage}</div>}
    </header>
  );
}

/** Kartu bertint + kisi titik tempat ilustrasi "diletakkan", dengan dua bintang melayang. */
export function IllustrationStage({ tint, children, className }: { tint: Tint; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'dot-grid relative isolate flex items-center justify-center overflow-hidden rounded-[28px] border border-line px-10 pb-3 pt-6 text-ink sm:pb-4 sm:pt-8',
        TINT_BG[tint],
        className,
      )}
    >
      <SparkleDoodle className="drift absolute left-[8%] top-[12%] size-5 opacity-80" />
      <span
        aria-hidden
        className="drift absolute bottom-[14%] right-[7%] size-3 rounded-pill border-2 border-current opacity-50"
        style={{ '--d': '1.2s' } as CSSProperties}
      />
      {children}
    </div>
  );
}

/**
 * Angka ringkas di bawah kepala halaman — hanya angka yang mengubah keputusan
 * pembaca. Di ponsel tiga ubin tetap satu baris (ikon disembunyikan): tiga
 * baris kartu setinggi 70px mendorong daftar yang dicari ke layar ketiga.
 */
export function StatTile({ icon: Icon, value, label, index = 0 }: { icon: LucideIcon; value: number | string; label: string; index?: number }) {
  return (
    <div
      className="rise flex min-w-0 flex-col gap-1 rounded-[18px] border border-line bg-panel px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
      style={{ '--i': index + 3 } as CSSProperties}
    >
      <span aria-hidden className="hidden size-10 shrink-0 items-center justify-center rounded-[12px] bg-panel-nested sm:flex">
        <Icon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[22px] font-bold leading-none tracking-[-0.03em]">{value}</span>
        <span className="text-[12px] leading-snug text-ink-muted sm:truncate sm:text-[12.5px]">{label}</span>
      </span>
    </div>
  );
}
