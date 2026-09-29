import Link from 'next/link';
import { ArrowUpRight, Award, EyeOff, Globe, Pencil } from 'lucide-react';
import { jakartaDateParts } from '@/lib/deadline';
import { achievementRank, portfolioOutcomeLabel } from '@/lib/portfolio';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type PortfolioEntry } from '@/types/domain';

export interface PortfolioRow {
  readonly entry: PortfolioEntry;
  /** Hanya tampilan pemilik: siapa yang melihat baris ini, dan tautan ubahnya. */
  readonly visibility?: 'public' | 'private' | 'never';
  readonly editHref?: string;
}

/**
 * Daftar portofolio (ADR-046), dipakai profil sendiri dan profil publik
 * orang lain. Urut waktu terbaru; hasil ditulis sebagai teks + ikon, bukan
 * warna saja. Tautan bukti dari pengguna divalidasi ulang di titik render.
 */
export function PortfolioList({ rows, now, emptyText }: { rows: readonly PortfolioRow[]; now: Date; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="border-t border-line py-3.5 text-sm text-ink-muted">{emptyText}</p>;
  }

  return (
    <ol className="flex flex-col">
      {rows.map(({ entry, visibility, editHref }) => {
        const running = entry.deadlineAt !== null && new Date(entry.deadlineAt) >= now;
        const year = entry.deadlineAt ? (jakartaDateParts(entry.deadlineAt)?.year ?? null) : null;
        const proofUrl = entry.proofUrl ? sanitizeExternalUrl(entry.proofUrl) : null;
        const highlight = achievementRank(entry.achievement) >= 3;
        return (
          <li key={entry.eventId} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-line py-4">
            <span className="pt-0.5 font-mono text-sm font-medium text-ink-muted">{running ? 'Kini' : (year ?? '—')}</span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-[22px] items-center gap-1 rounded-[6px] px-2 text-xs font-semibold',
                    highlight ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-soft',
                  )}
                >
                  {highlight && <Award aria-hidden className="size-3" />}
                  {portfolioOutcomeLabel(entry)}
                </span>
                <span className="text-[12.5px] text-ink-muted">{EVENT_TYPE_LABEL[entry.eventType]}</span>
                {visibility && <VisibilityChip visibility={visibility} />}
              </span>
              <Link href={`/events/${entry.slug}`} className="text-[15px] font-semibold leading-snug hover:underline">
                {entry.title}
              </Link>
              <span className="text-[13px] text-ink-muted">
                {entry.organizer}
                {entry.achievementNote && ` · ${entry.achievementNote}`}
              </span>
              {(proofUrl || editHref) && (
                <span className="flex flex-wrap gap-x-4">
                  {proofUrl && (
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium underline underline-offset-[3px]"
                    >
                      Lihat bukti <ArrowUpRight aria-hidden className="size-3.5" />
                      <span className="sr-only">(tab baru, tautan dari pemilik profil)</span>
                    </a>
                  )}
                  {editHref && (
                    <Link href={editHref} className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink">
                      <Pencil aria-hidden className="size-3.5" /> Ubah hasil
                      <span className="sr-only"> untuk {entry.title}</span>
                    </Link>
                  )}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VisibilityChip({ visibility }: { visibility: 'public' | 'private' | 'never' }) {
  const text = visibility === 'public' ? 'Publik' : visibility === 'private' ? 'Privat' : 'Hanya kamu';
  const Icon = visibility === 'public' ? Globe : EyeOff;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
      <Icon aria-hidden className="size-3" /> {text}
    </span>
  );
}
