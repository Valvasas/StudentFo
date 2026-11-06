import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, Check, ChevronDown, Hourglass, ShieldCheck } from 'lucide-react';
import { BadgeMedal } from '@/components/profile/badge-medal';
import { isFreshBadge, nearestBadgeGoal, summarizeBadges, type BadgeKey, type BadgeProgress, type BadgeTier } from '@/lib/achievements';
import { formatDateId } from '@/lib/deadline';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';
import { cn } from '@/lib/utils';

const navHref = (key: 'LOMBA' | 'WORKSHOP') => {
  const item = EVENT_TYPE_NAV.find((entry) => entry.key === key);
  return item ? eventTypeHref(item) : '/events';
};

const NEXT_STEP: Record<BadgeKey, { readonly href: string; readonly label: string }> = {
  kompetitor: { href: navHref('LOMBA'), label: 'Cari lomba' },
  pembelajar: { href: navHref('WORKSHOP'), label: 'Cari workshop' },
  penjelajah: { href: '/events', label: 'Jelajahi jenis lain' },
  kontributor: { href: '/submit', label: 'Kirim kegiatan' },
  terverifikasi: { href: '/penyelenggara', label: 'Lihat pengajuan' },
  'tuan-rumah': { href: '/penyelenggara', label: 'Buka studio' },
};

function pendingNote(item: BadgeProgress): string | null {
  if (item.pending === 0) return null;
  if (item.definition.key === 'terverifikasi') return 'Pengajuanmu sedang diperiksa moderator.';
  return `${item.pending} lagi terkonfirmasi — dihitung setelah pendaftarannya ditutup.`;
}

function tierLine(item: BadgeProgress): string {
  if (!item.current) return 'Belum diraih';
  return item.definition.levels.length > 1 ? `Tingkat ${item.tier} · ${item.current.title}` : item.current.title;
}

function BadgeCard({ item, now, index }: { item: BadgeProgress; now: Date; index: number }) {
  const { definition, next } = item;
  const fresh = isFreshBadge(item, now);
  const target = next ?? definition.levels.at(-1);
  const ratio = target ? Math.min(1, item.count / target.threshold) : 1;
  const note = pendingNote(item);
  const step = NEXT_STEP[definition.key];
  const titleId = `lencana-${definition.key}`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn('rise flex min-w-0 flex-col gap-4 rounded-[20px] border bg-panel p-5', item.tier > 0 ? 'border-line' : 'border-dashed border-line-strong/70')}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-4">
        <BadgeMedal badge={definition.key} tier={item.tier} className="w-[76px] shrink-0 sm:w-[84px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={titleId} className="text-[16.5px] font-semibold leading-snug tracking-[-0.01em]">
              {definition.name}
            </h3>
            {fresh && <span className="rounded-pill bg-highlight px-2 py-px text-[11.5px] font-bold text-on-highlight">Baru</span>}
          </div>
          <p className={cn('text-[14px]', item.tier > 0 ? 'font-medium text-ink' : 'text-ink-muted')}>
            {tierLine(item)}
          </p>
          {item.earnedAt && <p className="text-[12.5px] text-ink-muted">Diraih {formatDateId(item.earnedAt)}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`Kemajuan ${definition.name}`}
            aria-valuemin={0}
            aria-valuemax={target?.threshold ?? 1}
            aria-valuenow={Math.min(item.count, target?.threshold ?? 1)}
            className="h-2 flex-1 overflow-hidden rounded-pill bg-panel-nested"
          >
            <span className="block h-full rounded-pill bg-brand transition-[width] duration-700 ease-enter" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          {/* Medali yang sedang dikejar — pratinjau bentuk tingkat berikutnya. */}
          {next && <BadgeMedal badge={definition.key} tier={(item.tier + 1) as BadgeTier} className="w-8 shrink-0 opacity-50 grayscale" />}
        </div>
        <p className="text-[13px] text-ink-soft">
          {next ? (
            <>
              <strong className="font-semibold tabular-nums text-ink">
                {item.count} dari {next.threshold}
              </strong>{' '}
              {definition.unit} menuju <span className="font-medium">{next.title}</span>
            </>
          ) : (
            'Tingkat tertinggi sudah kamu raih.'
          )}
        </p>
        {note && (
          <p className="flex items-start gap-1.5 text-[12.5px] text-ink-muted">
            <Hourglass aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {note}
          </p>
        )}
      </div>

      <details className="group -mx-1 border-t border-line pt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-1 text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
          Cara meraih &amp; kenapa adil
          <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-1 pb-1 pt-1 text-[13.5px] leading-relaxed">
          <p className="text-ink-soft">{definition.rule}</p>
          <ol className="flex flex-col gap-1.5">
            {definition.levels.map((level, levelIndex) => {
              const done = item.count >= level.threshold;
              return (
                <li key={level.title} className="flex items-center gap-3">
                  <BadgeMedal badge={definition.key} tier={(levelIndex + 1) as BadgeTier} className={cn('w-9 shrink-0', !done && 'opacity-45 grayscale')} />
                  <span className={cn('flex min-w-0 flex-1 flex-col leading-snug', done ? 'text-ink' : 'text-ink-muted')}>
                    <span className="font-medium">{level.title}</span>
                    <span className="text-[12.5px] text-ink-muted">
                      {level.threshold} {definition.unit}
                    </span>
                  </span>
                  {done ? (
                    <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold">
                      <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
                      Diraih
                    </span>
                  ) : (
                    <span className="sr-only">, belum diraih</span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="flex items-start gap-2 rounded-card bg-panel-nested px-3 py-2.5 text-[13px] text-ink-soft">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {definition.fairness}
          </p>
        </div>
      </details>

      {next && (
        <Link href={step.href} className="-mt-2 inline-flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-semibold underline underline-offset-[3px] hover:no-underline">
          {step.label}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </article>
  );
}

/**
 * Tab Lencana di profil sendiri. Belum tampil di profil publik: menampilkan
 * lencana orang lain butuh fungsi SQL agregat baru (pendaftaran orang lain
 * tertutup RLS, memang seharusnya) + pilihan privasi — lihat ADR-068.
 */
export function BadgeBoard({ progress, now }: { progress: readonly BadgeProgress[] | null; now: Date }) {
  if (!progress) {
    return (
      <p role="status" className="rounded-[18px] border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-muted">
        Lencana belum bisa dihitung sekarang. Muat ulang halaman sebentar lagi — tidak ada lencana yang hilang.
      </p>
    );
  }

  const summary = summarizeBadges(progress);
  const goal = nearestBadgeGoal(progress);
  const ordered = [...progress].sort((left, right) => right.tier - left.tier);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="lencana-title" className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[20px] border border-line bg-panel-nested p-5 sm:p-6">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <h2 id="lencana-title" className="text-[19px] font-bold tracking-[-0.02em]">
            Lencana
          </h2>
          <p className="text-[14px] text-ink-soft">
            {summary.earned > 0
              ? `${summary.earned} lencana · ${summary.tiersEarned} dari ${summary.tiersTotal} tingkat diraih.`
              : 'Belum ada lencana. Yang pertama cukup dari satu pendaftaran terkonfirmasi lewat formulir StudentFo.'}
            {goal?.next && (
              <>
                {' '}
                Berikutnya: <strong className="font-semibold text-ink">{goal.next.threshold - goal.count} {goal.definition.unit} lagi</strong> menuju {goal.next.title}.
              </>
            )}
          </p>
        </div>
        <p className="flex min-w-0 flex-[1_1_300px] items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" />
          <span>
            Dihitung ulang setiap kali halaman ini dibuka, dari catatan yang tidak bisa kamu ubah sendiri: pendaftaran yang dikonfirmasi panitia, acara yang
            sudah ditutup, dan kiriman yang disetujui moderator. Tidak ada tombol klaim, dan pendaftaran yang dibatalkan ikut menghapus hitungannya.
          </span>
        </p>
      </section>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        {ordered.map((item, index) => (
          <BadgeCard key={item.definition.key} item={item} now={now} index={index} />
        ))}
      </div>
    </div>
  );
}

/** Deretan medali kecil di kartu profil — pintu ke tab Lencana. */
export function BadgeStrip({ progress, href }: { progress: readonly BadgeProgress[]; href: string }) {
  const earned = progress.filter((item) => item.tier > 0).sort((left, right) => right.tier - left.tier);
  const goal = nearestBadgeGoal(progress);
  return (
    <Link
      href={href}
      scroll={false}
      className="group flex min-h-11 w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-line px-3 py-2 transition-colors duration-150 ease-snap hover:bg-panel-nested"
    >
      {earned.length > 0 ? (
        <span aria-hidden className="flex items-center -space-x-1.5">
          {earned.slice(0, 4).map((item) => (
            <BadgeMedal key={item.definition.key} badge={item.definition.key} tier={item.tier} className="w-8" />
          ))}
        </span>
      ) : (
        <BadgeMedal badge={goal?.definition.key ?? 'kompetitor'} tier={0} className="w-8" />
      )}
      <span className="flex min-w-0 flex-col text-[13px] leading-snug">
        <span className="font-semibold">{earned.length > 0 ? `${earned.length} lencana` : 'Belum ada lencana'}</span>
        {goal?.next && (
          <span className="text-ink-muted">
            {goal.next.threshold - goal.count} {goal.definition.unit} lagi menuju {goal.next.title}
          </span>
        )}
      </span>
      <ArrowRight aria-hidden className="size-3.5 text-ink-muted transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
    </Link>
  );
}
