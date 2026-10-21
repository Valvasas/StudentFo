import { randomUUID } from 'node:crypto';
import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { ActiveFilterChips } from '@/components/match/active-filter-chips';
import { CardSummary } from '@/components/match/card-summary';
import type { DeckSlide } from '@/components/match/deck/deck-context';
import { MatchDeck } from '@/components/match/deck/match-deck';
import { MatchCard } from '@/components/match/match-card';
import { MatchEmpty } from '@/components/match/match-empty';
import { MatchEndCard } from '@/components/match/match-end-card';
import { MatchFilters } from '@/components/match/match-filters';
import { ScanSession } from '@/components/match/scan-session';
import { ScanStage } from '@/components/match/scan-stage';
import { ForgetSeekerDraft } from '@/components/match/use-seeker-draft';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { buttonVariants } from '@/components/ui/button';
import { parseActionErrorCode, parseActionNoticeCode } from '@/lib/action-feedback';
import { getEventRepository } from '@/lib/data';
import { filterGroups, releaseFilter } from '@/lib/match-filter-release';
import {
  CHEMISTRY_TEXT,
  MATCH_CANDIDATE_WINDOW,
  MATCH_PAGE_SIZE,
  MATCH_SHOWN_CHOICES,
  parseMatchQuery,
  rankCandidates,
  serializeMatchQuery,
  type MatchViewer,
} from '@/lib/matchmaking';
import { NETWORK_LIMITS } from '@/lib/network';
import { digestRowOf, portfolioDigestOf } from '@/lib/portfolio';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, type TeamSeekerProfile } from '@/types/domain';
import { PAGE, RESULTS_ID, type MatchViewProps } from './shared';

const MAX_SHOWN = MATCH_SHOWN_CHOICES[MATCH_SHOWN_CHOICES.length - 1]!;

/** Kartu pemain terbuka: hasil pencocokan sebagai satu tumpukan kartu koleksi (ADR-058). */
export async function ResultsView({ user, params, profile }: MatchViewProps & { readonly profile: TeamSeekerProfile }) {
  const repository = await getEventRepository();
  const hasFeedback = Boolean(parseActionNoticeCode(params.notice) || parseActionErrorCode(params.error));

  const query = parseMatchQuery(params);
  const [candidates, trackerItems, categories] = await Promise.all([
    repository.listSeekerCandidates(user.id, MATCH_CANDIDATE_WINDOW.default),
    repository.listTrackerItems(user.id),
    repository.listCategories(),
  ]);
  const categoryName = (slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug;

  const viewer: MatchViewer = {
    userId: user.id,
    educationLevel: user.educationLevel,
    major: user.major,
    interests: user.interests,
    profile,
    portfolio: portfolioDigestOf(trackerItems.map(digestRowOf)),
  };
  const rank = (filters = query.filters, style = query.style) =>
    rankCandidates(viewer, candidates, { style, filters, categoryName, limit: candidates.length });

  const qualified = rank();
  const matches = qualified.slice(0, query.show);
  const canShowMore = qualified.length > matches.length && query.show < MAX_SHOWN;
  const moreCount = Math.min(MATCH_PAGE_SIZE, qualified.length - matches.length);
  const moreHref = `${PAGE}${serializeMatchQuery({ ...query, go: false, show: query.show + MATCH_PAGE_SIZE })}`;
  const scanning = query.go && matches.length > 0;
  // Pemindaian ulang saat halaman sudah dalam keadaan memindai (URL masih `cari=1` di router) harus memasang
  // ulang radar: tanpa key baru React memakai elemen lama dan animasinya tak diputar lagi. Hanya radar yang
  // dipasang ulang; deck tetap (fokus & status) dan membagikan ulang kartunya sendiri lewat `epoch`.
  const scanKey = scanning ? randomUUID() : undefined;
  const returnTo = `${PAGE}${serializeMatchQuery({ ...query, go: false })}`;
  const rescanHref = `${PAGE}${serializeMatchQuery({ ...query, go: true })}`;

  const slides: DeckSlide[] = matches.map((match, index) => {
    const { person, relation } = match.candidate;
    const level = person.educationLevel ? EDUCATION_LEVEL_LABEL[person.educationLevel] : null;
    return {
      id: person.userId,
      name: person.fullName,
      subtitle: [person.major, level].filter(Boolean).join(' · '),
      score: match.score,
      chemistry: CHEMISTRY_TEXT[match.chemistry].label,
      reason: match.reasons[0] ?? null,
      relation,
      canInvite: relation === null,
      card: <MatchCard match={match} returnTo={returnTo} categoryName={categoryName} rank={index + 1} total={matches.length} scanning={scanning} />,
    };
  });
  const outgoingCount = matches.filter((match) => match.candidate.relation === 'outgoing').length;

  // Hanya untuk keadaan kosong: berapa orang yang muncul bila SATU saringan dilepas.
  const removals =
    matches.length === 0 && candidates.length > 0
      ? filterGroups(query)
          .map((group) => {
            const released = releaseFilter(query, group.key);
            return { label: group.label, href: `${PAGE}${serializeMatchQuery(released)}`, gain: rank(released.filters, released.style).length };
          })
          .filter((removal) => removal.gain > 0)
          .sort((a, b) => b.gain - a.gain)
      : [];

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="text-[13.5px] text-ink-muted">
        {candidates.length === 0
          ? 'Belum ada pemain lain yang membuka kartunya.'
          : `${qualified.length} dari ${candidates.length} pemain lolos saringanmu${qualified.length > matches.length ? ` · ${matches.length} teratas ditampilkan` : ''}.`}
      </p>
      {canShowMore && (
        <Link href={moreHref} scroll={false} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')}>
          Tampilkan {moreCount} lagi
        </Link>
      )}
    </div>
  );

  const heading = (
    <h2 id="hasil-judul" className="font-display text-[19px] font-bold tracking-[-0.02em]">
      {matches.length > 0 ? 'Pasangan terbaik untukmu' : 'Belum ada yang cocok'}
    </h2>
  );

  return (
    <div className="container-page pb-24 pt-6 sm:pt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
        <Link href="/teams" className="flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Cari tim
        </Link>
        <Link href={rescanHref} className={cn(buttonVariants({ variant: 'secondary' }), 'rounded-pill')}>
          <RefreshCw aria-hidden /> Cari ulang
        </Link>
      </div>

      <header className="enter mb-6 flex max-w-2xl flex-col gap-2">
        <h1 className="text-[clamp(28px,5vw,44px)] leading-[1.04] tracking-[-0.035em]">Pasangan timmu</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">Satu kartu satu orang, diurutkan dari yang paling cocok.</p>
      </header>

      <ForgetSeekerDraft viewerId={user.id} />
      <ActionFeedback params={params} className="mb-6 max-w-2xl" />
      {hasFeedback && !scanning && <ScrollToTop key={randomUUID()} />}

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MatchFilters query={query} hasCity={profile.city !== null} />
          <ActiveFilterChips query={query} />

          <section id={RESULTS_ID} tabIndex={-1} aria-labelledby="hasil-judul" className={cn('relative mt-2 scroll-mt-32 outline-none sm:scroll-mt-24', scanning && 'min-h-[620px]')}>
            {scanning && (
              <Fragment key={scanKey}>
                <ScanSession
                  scanId={scanKey ?? ''}
                  targetId={RESULTS_ID}
                  startText="Mencari pemain yang kartunya terbuka…"
                  doneText={`Selesai: ${matches.length} pasangan teratas siap di tumpukan.`}
                />
                <ScanStage
                  you={{ seed: user.id, name: user.fullName }}
                  blips={matches.slice(0, 6).map((match) => ({ seed: match.candidate.person.userId, name: match.candidate.person.fullName }))}
                />
              </Fragment>
            )}

            <div className={cn('flex flex-col gap-4', scanning && 'scan-results')}>
              {slides.length > 0 ? (
                <MatchDeck
                  viewerId={user.id}
                  slides={slides}
                  heading={heading}
                  endCard={
                    <MatchEndCard
                      shownCount={matches.length}
                      qualifiedCount={qualified.length}
                      outgoingCount={outgoingCount}
                      moreHref={canShowMore ? moreHref : null}
                      moreCount={moreCount}
                      rescanHref={rescanHref}
                      maxed={qualified.length > matches.length && !canShowMore}
                    />
                  }
                  footer={footer}
                  returnTo={returnTo}
                  focusTargetId={RESULTS_ID}
                  scanning={scanning}
                  epoch={randomUUID()}
                  messageMax={NETWORK_LIMITS.messageMax}
                />
              ) : (
                <>
                  {heading}
                  <MatchEmpty candidateCount={candidates.length} removals={removals} />
                  {footer}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-[92px]">
          <CardSummary user={user} profile={profile} />
        </div>
      </div>
    </div>
  );
}
