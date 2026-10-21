import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowLeft, Check, MapPin, Trophy, UserPlus, Wifi } from 'lucide-react';
import { inviteMatchAction } from '@/app/teams/cocok/actions';
import { FlipButton, InviteTrigger, SkipButton } from '@/components/match/deck/deck-controls';
import { MatchRing } from '@/components/match/match-ring';
import { ScoreHex } from '@/components/match/score-hex';
import { ConnectionMessageField } from '@/components/network/connection-message-field';
import { Avatar, TINT_BG } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { distanceLabel } from '@/lib/geo';
import { CHEMISTRY_TEXT, describePortfolio, type Match } from '@/lib/matchmaking';
import { coverTintOf } from '@/lib/tint';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, skillLabel } from '@/types/domain';

/** Ketika pemindaian berjalan, isian cincin & batang menunggu hasil muncul (lihat `scan-results`). */
const SCAN_DELAY_MS = 2700;
/** Dari skor ini angka di cincin ditandai stabilo. */
const MARKED_SCORE = 75;

/** Tautan-tombol yang boleh membungkus: teksnya panjang dan kartu bisa selebar 280px. */
const linkButton = (variant: 'primary' | 'secondary') =>
  cn(buttonVariants({ variant, size: null }), 'min-h-11 w-full whitespace-normal px-4 py-2 text-center text-sm leading-snug');

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

/**
 * Tanpa JS tombol di sini LANGSUNG mengirim (form POST ke Server Action).
 * Setelah hidrasi `InviteTrigger` menggantikannya dengan tombol yang hanya
 * membuka lembar tinjau — gestur tidak pernah mengirim apa pun.
 */
function InviteAction({ match, returnTo, idPrefix }: { match: Match; returnTo: string; idPrefix: string }) {
  const { candidate } = match;
  if (candidate.relation === 'outgoing') {
    return (
      <Link href="/connections?tab=ajakan" className={linkButton('secondary')}>
        <Check aria-hidden /> Ajakan terkirim · lihat statusnya
      </Link>
    );
  }
  if (candidate.relation === 'incoming') {
    return (
      <Link href="/connections?tab=ajakan" className={linkButton('primary')}>
        <UserPlus aria-hidden /> Dia sudah mengajakmu · jawab
      </Link>
    );
  }
  return (
    <form action={inviteMatchAction} className="flex min-w-0 flex-col gap-1">
      <input type="hidden" name="targetId" value={candidate.person.userId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <InviteTrigger
        id={candidate.person.userId}
        fallback={
          <SubmitButton pendingLabel="Mengirim…" className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}>
            <UserPlus aria-hidden /> Ajak jadi partner
          </SubmitButton>
        }
      >
        <UserPlus aria-hidden /> Ajak jadi partner
      </InviteTrigger>
      <ConnectionMessageField idPrefix={idPrefix} />
    </form>
  );
}

/**
 * Kartu koleksi satu calon partner (ADR-057/058). Server Component: seluruh
 * isinya ikut HTML pertama dan form ajakannya tetap berfungsi tanpa JS.
 * Muka depan dan belakang (<details> rincian) sama-sama ada di DOM; JS hanya
 * menukar mana yang tampil. Tata letak landscape lewat container query pada
 * slot tumpukan (>= 560px).
 *
 * Tidak ada email, alamat, atau koordinat: yang tampil hanya yang dipilih
 * orangnya untuk dilihat (nama, jurusan, kota, keahlian, pengantar,
 * portofolio PUBLIK). Pita sampul = tint IDENTITAS pemilik kartu.
 */
export function MatchCard({
  match,
  returnTo,
  categoryName,
  rank,
  total,
  scanning = false,
}: {
  match: Match;
  returnTo: string;
  categoryName: (slug: string) => string;
  rank: number;
  total: number;
  scanning?: boolean;
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
  // Hanya yang ditulis untuk kartu ini: headline Koneksi tidak dipinjam, supaya pratinjau di form ("Beginilah
  // kartumu terlihat") jujur dan kartu tak membawa teks yang orangnya tidak pilih untuk kartu.
  const pitch = candidate.pitch;

  return (
    <article aria-labelledby={headingId} data-face="front" className="mc relative flex h-full flex-col rounded-[24px] border border-line bg-panel">
      <div className="mc-faces relative flex-1 rounded-t-[inherit]">
        <div className="mc-front grid min-w-0 @min-[560px]:grid-cols-[256px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col">
            <div className={cn('mc-ribbon dot-grid relative min-h-16 shrink-0 rounded-t-[23px] @min-[560px]:rounded-tr-none', TINT_BG[coverTintOf(person.userId)])}>
              {/* pb-9 = jalur yang ditutup avatar (-mt-7 + cincin): stempel panjang yang membungkus mendorong pita ke bawah, bukan masuk ke bawah avatar. */}
              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1 pb-9 pl-4 pr-16 pt-3">
                <span className="chem-stamp min-w-0 rounded-[6px] border-2 border-ink bg-panel px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase leading-tight tracking-[0.06em] text-ink">
                  {chemistry.label}
                </span>
                <span className="font-mono text-[11px] font-medium leading-[1.9] text-ink">
                  <span className="sr-only">Peringkat </span>
                  {rank}/{total}
                </span>
              </div>
              <div className="absolute right-2 top-2.5">
                <FlipButton id={person.userId} name={person.fullName} />
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4">
              <div className="flex items-start gap-3">
                <Avatar name={person.fullName} seed={person.userId} size="lg" ring className="relative -mt-7" />
                {candidate.relation === 'outgoing' && (
                  <span aria-hidden className="stamp mt-1 rounded-[6px] border-2 border-ink px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink" style={{ '--d': `${baseDelay + 700}ms` } as CSSProperties}>
                    Terkirim
                  </span>
                )}
              </div>
              <MatchRing score={match.score} size={64} delayMs={baseDelay} marked={match.score >= MARKED_SCORE} className="row-span-2 mt-2 rounded-pill bg-panel ring-4 ring-panel" />
              <div className="flex min-w-0 flex-col pt-0.5">
                <h3 id={headingId} className="font-display text-[21px] font-bold leading-tight tracking-[-0.025em]">
                  {/* Tanpa margin negatif: nama dua baris tak boleh menimpa subjudul. Tinggi min 44px = target sentuh. */}
                  <Link href={`/orang/${person.userId}`} className="inline-flex min-h-11 min-w-11 max-w-full items-center hover:underline">
                    {person.fullName}
                  </Link>
                </h3>
                {sub && <p className="text-[13px] text-ink-muted">{sub}</p>}
              </div>
            </div>

            {pitch && <p className="mc-quote px-4 pb-4 pt-3 text-[14.5px] leading-relaxed text-ink-soft">&ldquo;{pitch}&rdquo;</p>}
          </div>

          <div className="mc-body flex min-w-0 flex-col gap-3.5 px-4 pb-4 @min-[560px]:pl-0 @min-[560px]:pr-5 @min-[560px]:pt-5">
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
                      'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[12px]',
                      matched.has(skill) ? 'border-brand bg-highlight-soft font-semibold text-ink' : 'border-line bg-panel-nested text-ink-soft',
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
                <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug">
                  {match.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <details className="mc-more group">
          <summary className="mc-sum flex min-h-11 w-full cursor-pointer list-none items-center px-4 text-[13px] font-medium text-ink-muted underline decoration-dashed decoration-line-strong underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Lihat rincian kecocokan</span>
            <span className="hidden items-center gap-1.5 group-open:inline-flex">
              <ArrowLeft aria-hidden className="mc-live-only size-4" />
              <span className="mc-live-only">Balik ke depan · </span>
              Rincian kecocokan
            </span>
          </summary>
          <div className="grid gap-4 px-4 pb-4 pt-2 @min-[560px]:grid-cols-[152px_minmax(0,1fr)] @min-[560px]:gap-x-6">
            <div className="flex items-center gap-4 @min-[560px]:flex-col @min-[560px]:items-start">
              <ScoreHex components={match.components} className="size-[120px] shrink-0 text-ink sm:size-[132px]" />
              <p className="flex flex-col gap-0.5">
                <span className="font-display text-[44px] font-bold leading-none tracking-[-0.04em]">
                  {match.score}
                  <span className="ml-1 text-[14px] font-medium tracking-normal text-ink-muted">/ 100</span>
                </span>
                <span className="text-[12.5px] text-ink-muted">Skor kecocokan</span>
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-col gap-2.5">
                <h4 className="text-[12.5px] font-semibold text-ink-muted">Dari mana skornya</h4>
                <ScoreBars match={match} delayMs={0} />
              </div>
              <p className="text-[13px] text-ink-soft">Kimia: {chemistry.hint}</p>
              {match.sharedInterests.length > 0 && <p className="text-[12.5px] text-ink-muted">Minat sama: {match.sharedInterests.map(categoryName).join(', ')}</p>}
              {pitch && <p className="text-[14px] leading-relaxed text-ink-soft">&ldquo;{pitch}&rdquo;</p>}
            </div>
          </div>
        </details>
      </div>

      <div className="mc-footer flex flex-wrap items-start gap-2 border-t border-line px-4 py-3">
        <SkipButton id={person.userId} name={person.fullName} />
        <div className="min-w-[10rem] flex-1">
          <InviteAction match={match} returnTo={returnTo} idPrefix={headingId} />
        </div>
      </div>

      <span aria-hidden className="stamp-no">
        Lewati
      </span>
      <span aria-hidden className="stamp-yes">
        Ajak?
      </span>
    </article>
  );
}
