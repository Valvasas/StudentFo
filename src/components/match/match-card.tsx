import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Check, MapPin, Sparkles, Trophy, UserPlus, Wifi } from 'lucide-react';
import { inviteMatchAction } from '@/app/teams/cocok/actions';
import { DismissibleMatch, SkipMatchButton } from '@/components/match/dismissible-match';
import { MatchRing } from '@/components/match/match-ring';
import { ConnectionMessageField } from '@/components/network/connection-message-field';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { distanceLabel } from '@/lib/geo';
import { CHEMISTRY_TEXT, describePortfolio, type Match } from '@/lib/matchmaking';
import { EDUCATION_LEVEL_LABEL, skillLabel } from '@/types/domain';
import { cn } from '@/lib/utils';

/** Ketika pemindaian berjalan, isian cincin & batang menunggu hasil muncul (lihat `scan-results`). */
const SCAN_DELAY_MS = 2700;

function ScoreBars({ match, delayMs }: { match: Match; delayMs: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {match.components.map((component, index) => {
        const percent = Math.round(component.score * 100);
        return (
          <li key={component.key} className="grid grid-cols-[96px_minmax(0,1fr)_36px] items-center gap-3 text-[13px]">
            <span className="text-ink-soft">{component.label}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-panel-nested">
              <span className="grow-x block h-full rounded-pill bg-brand" style={{ width: `${percent}%`, animationDelay: `${delayMs + index * 70}ms` }} />
            </span>
            <span className="text-right tabular-nums text-ink-muted">
              {percent}
              <span className="sr-only"> persen</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function InviteAction({ match, returnTo, idPrefix }: { match: Match; returnTo: string; idPrefix: string }) {
  const { candidate } = match;
  if (candidate.relation === 'outgoing') {
    return (
      <Link href="/connections?tab=ajakan" className={buttonVariants({ variant: 'secondary' })}>
        <Check aria-hidden /> Ajakan terkirim · lihat statusnya
      </Link>
    );
  }
  if (candidate.relation === 'incoming') {
    return (
      <Link href="/connections?tab=ajakan" className={buttonVariants({ variant: 'primary' })}>
        <UserPlus aria-hidden /> Dia sudah mengajakmu · jawab
      </Link>
    );
  }
  return (
    <form action={inviteMatchAction} className="flex flex-col gap-1">
      <input type="hidden" name="targetId" value={candidate.person.userId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ variant: 'primary' })}>
        <UserPlus aria-hidden /> Ajak jadi partner
      </SubmitButton>
      <ConnectionMessageField idPrefix={idPrefix} />
    </form>
  );
}

/**
 * Kartu satu calon partner (ADR-057). Server Component: seluruh isinya ikut
 * HTML pertama, dan form ajakannya tetap berfungsi tanpa JavaScript. Hanya
 * tombol "Lewati" yang menambah interaksi klien.
 *
 * Tidak ada email, alamat, atau koordinat: yang tampil hanya yang
 * dipilih orangnya untuk dilihat (nama, jurusan, kota, keahlian, pengantar,
 * portofolio PUBLIK).
 */
export function MatchCard({
  match,
  returnTo,
  categoryName,
  featured = false,
  index = 0,
  scanning = false,
  focusTargetId,
}: {
  match: Match;
  returnTo: string;
  categoryName: (slug: string) => string;
  featured?: boolean;
  index?: number;
  scanning?: boolean;
  focusTargetId: string;
}) {
  const { candidate } = match;
  const person = candidate.person;
  const chemistry = CHEMISTRY_TEXT[match.chemistry];
  const baseDelay = scanning ? SCAN_DELAY_MS : 0;
  const portfolio = describePortfolio(candidate.portfolio);
  const headingId = `cocok-${person.userId}`;
  const level = person.educationLevel ? EDUCATION_LEVEL_LABEL[person.educationLevel] : null;
  const sub = [person.major, level].filter(Boolean).join(' · ');
  const matched = new Set<string>(match.matchedSeeking);

  return (
    <DismissibleMatch focusTargetId={focusTargetId} className="h-full">
      <article
        aria-labelledby={headingId}
        className={cn(
          'rise flex h-full flex-col gap-4 rounded-[24px] border bg-panel p-5 sm:p-6',
          featured ? 'border-brand shadow-raised' : 'border-line',
        )}
        style={{ '--i': index } as CSSProperties}
      >
        <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {/* Avatar unggulan 56px di ponsel: 80px + cincin 104px membuat nama pecah tiga baris di 390px. */}
          <Avatar name={person.fullName} seed={person.userId} size={featured ? 'xl' : 'lg'} className={cn('shrink-0', featured && 'size-14 text-base sm:size-20 sm:text-[22px]')} />
          <div className="flex min-w-[9.5rem] flex-1 flex-col gap-1">
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-brand-text',
                featured && 'stamp rounded-[8px] border-2 border-brand px-2 py-0.5',
              )}
              style={featured ? ({ '--d': `${baseDelay + 500}ms` } as CSSProperties) : undefined}
            >
              <Sparkles aria-hidden className="size-3.5" />
              {chemistry.label}
            </span>
            <h3 id={headingId} className={cn('font-display font-bold leading-tight tracking-[-0.025em]', featured ? 'text-[26px]' : 'text-[19px]')}>
              {/* Margin negatif: target sentuh 44px tanpa menggeser tata letak kartu (pola kartu Koneksi). */}
              <Link href={`/orang/${person.userId}`} className="-my-3 inline-flex min-h-11 max-w-full items-center hover:underline">
                {person.fullName}
              </Link>
            </h3>
            {sub && <p className="text-[13.5px] text-ink-muted">{sub}</p>}
          </div>
          <MatchRing score={match.score} size={featured ? 92 : 68} delayMs={baseDelay} className="ml-auto" />
        </header>

        {(candidate.pitch ?? person.headline) && <p className="text-[15px] leading-relaxed text-ink-soft">&ldquo;{candidate.pitch ?? person.headline}&rdquo;</p>}

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5" />
            {candidate.city ?? 'Kota belum diisi'}
            {match.distanceKm !== null && <span> · {distanceLabel(match.distanceKm)}</span>}
          </li>
          {candidate.remoteOk && (
            <li className="inline-flex items-center gap-1.5">
              <Wifi aria-hidden className="size-3.5" /> Bersedia kerja daring
            </li>
          )}
          <li className="inline-flex items-center gap-1.5">
            <Trophy aria-hidden className="size-3.5" /> {portfolio ?? 'Belum ada portofolio publik'}
          </li>
        </ul>

        {candidate.skills.length > 0 && (
          <ul aria-label="Keahlian" className="flex flex-wrap gap-1.5">
            {candidate.skills.map((skill) => (
              <li
                key={skill}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[12.5px]',
                  matched.has(skill) ? 'border-brand bg-accent-soft font-semibold text-ink' : 'border-line bg-panel-nested text-ink-soft',
                )}
              >
                {matched.has(skill) && <Check aria-hidden className="size-3" />}
                {skillLabel(skill)}
                {matched.has(skill) && <span className="sr-only"> (yang kamu cari)</span>}
              </li>
            ))}
          </ul>
        )}

        {match.reasons.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[12.5px] font-semibold text-ink-muted">Kenapa cocok</h4>
            <ul className="flex flex-col gap-1.5 text-[14px]">
              {match.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="group">
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center text-[13px] font-medium text-ink-muted underline decoration-dashed decoration-line-strong underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Lihat rincian kecocokan</span>
            <span className="hidden group-open:inline">Rincian kecocokan</span>
          </summary>
          <div className="pt-1.5">
            <ScoreBars match={match} delayMs={baseDelay} />
            {match.sharedInterests.length > 0 && (
              <p className="mt-3 text-[12.5px] text-ink-muted">Minat sama: {match.sharedInterests.map(categoryName).join(', ')}</p>
            )}
          </div>
        </details>

        <div className="mt-auto flex flex-wrap items-start gap-2 pt-1">
          <InviteAction match={match} returnTo={returnTo} idPrefix={`cocok-${person.userId}`} />
          <SkipMatchButton name={person.fullName} />
        </div>
      </article>
    </DismissibleMatch>
  );
}
