import { Eye, EyeOff } from 'lucide-react';
import { setBadgeVisibilityAction } from '@/app/profile/actions';
import { BadgeMedal } from '@/components/profile/badge-medal';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';
import type { BadgeProgress } from '@/lib/achievements';

/**
 * Lencana yang SUDAH diraih, untuk dilihat orang lain (ADR-072): profil
 * publik dan kartu lobi. Tanpa progres & tanpa "1 lomba lagi" — itu urusan
 * pemiliknya. Tingkat tertinggi dulu; `limit` untuk kartu yang sempit.
 */
export function PublicBadges({ progress, limit, compact = false, className }: { progress: readonly BadgeProgress[]; limit?: number; compact?: boolean; className?: string }) {
  const earned = progress.filter((item) => item.tier > 0 && item.current).sort((left, right) => right.tier - left.tier);
  if (earned.length === 0) return null;
  const shown = limit ? earned.slice(0, limit) : earned;
  return (
    <ul aria-label="Lencana yang diraih" className={cn('flex flex-wrap gap-2', className)}>
      {shown.map((item) => (
        <li
          key={item.definition.key}
          className={cn('flex items-center gap-2 rounded-pill border border-line bg-panel-nested pr-3', compact ? 'h-8 pl-1 text-[12.5px]' : 'h-10 pl-1.5 text-[13.5px]')}
        >
          <BadgeMedal badge={item.definition.key} tier={item.tier} className={compact ? 'size-6' : 'size-7'} />
          <span>
            <span className="font-semibold">{item.current!.title}</span>
            <span className="text-ink-muted"> · {item.definition.name}</span>
          </span>
        </li>
      ))}
      {limit && earned.length > limit && <li className="flex h-8 items-center text-[12.5px] text-ink-muted">+{earned.length - limit} lainnya</li>}
    </ul>
  );
}

/** Saklar "tampilkan lencanaku" di tab Lencana. Bawaan mati; nilai eksplisit, bukan "balik keadaan". */
export function BadgeVisibilityToggle({ show, adjustable }: { show: boolean; adjustable: boolean }) {
  return (
    <section aria-labelledby="lencana-publik" className="flex flex-col gap-3 rounded-[18px] border border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex max-w-[60ch] flex-col gap-1">
        <h2 id="lencana-publik" className="flex items-center gap-2 text-base font-semibold">
          {show ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
          {show ? 'Lencanamu tampil untuk orang lain' : 'Lencanamu privat'}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {adjustable
            ? 'Bila ditampilkan, orang yang bisa melihat profil publikmu dan sesama anggota lobi lomba melihat lencana yang SUDAH kamu raih — bukan acaranya, bukan progresmu.'
            : 'Pilihan ini aktif setelah pembaruan server terpasang. Sampai saat itu lencanamu tetap privat.'}
        </p>
      </div>
      <form action={setBadgeVisibilityAction} className="shrink-0">
        <input type="hidden" name="show" value={show ? 'off' : 'on'} />
        <SubmitButton disabled={!adjustable} pendingLabel="Menyimpan…" className={buttonVariants({ variant: show ? 'secondary' : 'primary', size: 'sm' })}>
          {show ? 'Jadikan privat' : 'Tampilkan lencanaku'}
        </SubmitButton>
      </form>
    </section>
  );
}
