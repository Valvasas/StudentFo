import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowLeft, Filter, MapPin, Pencil, Radar, RefreshCw, Sparkles, UsersRound, Wifi } from 'lucide-react';
import { saveSeekerAction } from '@/app/teams/cocok/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { MatchCard } from '@/components/match/match-card';
import { MatchFilters } from '@/components/match/match-filters';
import { MatchRadar } from '@/components/match/match-radar';
import { ScanSession } from '@/components/match/scan-session';
import { SeekerForm } from '@/components/match/seeker-form';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { FeatureHero, IllustrationStage } from '@/components/ui/feature-hero';
import { PuzzleSnapSketch } from '@/components/ui/feature-illustrations';
import { parseActionErrorCode, parseActionNoticeCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import {
  MATCH_CANDIDATE_WINDOW,
  MATCH_PAGE_SIZE,
  MATCH_SHOWN_CHOICES,
  parseMatchQuery,
  rankCandidates,
  serializeMatchQuery,
  type MatchViewer,
} from '@/lib/matchmaking';
import { parseSeekerFields } from '@/lib/matchmaking-schema';
import { digestRowOf, portfolioDigestOf } from '@/lib/portfolio';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, skillLabel, type TeamSeekerProfile } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cocokkan tim',
  description: 'Radar yang mencarikan rekan satu tim: sesuai keahlian, dekat dari kotamu, dan portofolionya meyakinkan.',
  robots: { index: false, follow: false },
};

const PAGE = '/teams/cocok';
const RESULTS_ID = 'hasil-pencocokan';

const SCAN_LINES = [
  'Memindai pemain yang kartunya terbuka…',
  'Menimbang keahlian, jarak, dan portofolio…',
  'Menyusun pasangan terbaik untukmu…',
] as const;

const HOW_IT_WORKS = [
  { icon: Pencil, title: 'Isi kartu pemain', body: 'Keahlianmu, yang kamu cari, dan kotamu. Sekali saja.' },
  { icon: Radar, title: 'Radar memindai', body: 'Keahlian, jarak, portofolio, dan minat ditimbang untuk tiap orang.' },
  { icon: UsersRound, title: 'Ajak yang cocok', body: 'Ajakan terkirim; kalian terhubung setelah dia menerima.' },
] as const;

function CardSummary({ user, profile }: { user: { id: string; fullName: string; major: string | null; educationLevel: keyof typeof EDUCATION_LEVEL_LABEL | null }; profile: TeamSeekerProfile }) {
  const sub = [user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="kartumu" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] border border-line bg-panel p-4 pr-5">
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3.5">
        <Avatar name={user.fullName} seed={user.id} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="kartumu" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Kartu pemainmu
          </h2>
          <p className="truncate text-[15px] font-semibold">
            {user.fullName}
            {sub && <span className="font-normal text-ink-muted"> · {sub}</span>}
          </p>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ink-muted">
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-3.5" /> {profile.city ?? 'Kota belum diisi'}
            </li>
            {profile.remoteOk && (
              <li className="inline-flex items-center gap-1.5">
                <Wifi aria-hidden className="size-3.5" /> Daring boleh
              </li>
            )}
            <li>
              {profile.skills.map(skillLabel).join(' · ')}
              {profile.seeking.length > 0 && <span> — mencari {profile.seeking.map(skillLabel).join(', ')}</span>}
            </li>
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Link href={`${PAGE}?ubah=1`} className="press inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-line-strong/70 bg-panel px-3.5 text-[13.5px] font-semibold hover:bg-panel-nested">
          <Pencil aria-hidden className="size-3.5" /> Ubah kartu
        </Link>
        {/* Menutup kartu = menyimpan ulang isi yang sama tanpa `open`. Form kecil,
            bukan tautan: mengubah data harus lewat POST (AGENTS.md §6). */}
        <form action={saveSeekerAction}>
          {profile.city && <input type="hidden" name="city" value={profile.city} />}
          {profile.skills.map((slug) => (
            <input key={`s-${slug}`} type="hidden" name="skills" value={slug} />
          ))}
          {profile.seeking.map((slug) => (
            <input key={`c-${slug}`} type="hidden" name="seeking" value={slug} />
          ))}
          {profile.remoteOk && <input type="hidden" name="remoteOk" value="on" />}
          {profile.pitch && <input type="hidden" name="pitch" value={profile.pitch} />}
          <button type="submit" className="inline-flex min-h-11 items-center rounded-sm px-3 text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
            Tutup kartu
          </button>
        </form>
      </div>
    </section>
  );
}

export default async function MatchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser(PAGE);
  const repository = await getEventRepository();
  const profile = await repository.getSeekerProfile(user.id);
  const person = { id: user.id, name: user.fullName, major: user.major, level: user.educationLevel };
  const hasFeedback = Boolean(parseActionNoticeCode(params.notice) || parseActionErrorCode(params.error));

  // Kartu belum ada, tertutup, atau sedang diubah → form. Hasil hanya untuk kartu terbuka
  // (timbal-balik, ADR-057): repository pun mengembalikan daftar kosong selain itu.
  if (!profile?.open || firstParam(params.ubah) === '1') {
    return (
      <div className="container-page pb-24 pt-8 sm:pt-12">
        <Link href="/teams" className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Cari tim
        </Link>
        <FeatureHero
          note="Pencocokan tim"
          title="Cocokkan tim otomatis"
          description="Isi kartu pemainmu sekali, lalu radar mencarikan orang yang melengkapi timmu — sesuai keahlian, dekat dari kotamu, dan portofolionya meyakinkan."
          stage={
            <IllustrationStage tint="sun" className="pb-3 pt-7">
              <PuzzleSnapSketch className="max-w-[320px]" />
            </IllustrationStage>
          }
        />

        <ol className="mt-10 grid gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="rise flex items-start gap-3.5 rounded-[20px] border border-line bg-panel p-4" style={{ '--i': index + 2 } as CSSProperties}>
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-panel-nested">
                <step.icon className="size-[18px]" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                  <span className="sr-only">Langkah {index + 1}: </span>
                  {step.title}
                </span>
                <span className="text-[13.5px] leading-snug text-ink-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <ActionFeedback params={params} className="mt-8 max-w-2xl" />
        {hasFeedback && <ScrollToTop key={randomUUID()} />}

        <div className="mt-8">
          <SeekerForm person={person} initial={profile} invalidFields={parseSeekerFields(params.fields)} />
        </div>
      </div>
    );
  }

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
  const qualified = rankCandidates(viewer, candidates, { style: query.style, filters: query.filters, categoryName, limit: candidates.length });
  const matches = qualified.slice(0, query.show);
  const canShowMore = qualified.length > matches.length && query.show < MATCH_SHOWN_CHOICES[MATCH_SHOWN_CHOICES.length - 1]!;
  const moreHref = `${PAGE}${serializeMatchQuery({ ...query, go: false, show: query.show + MATCH_PAGE_SIZE })}`;
  const [best, ...others] = matches;

  const scanning = query.go && matches.length > 0;
  const returnTo = `${PAGE}${serializeMatchQuery({ ...query, go: false })}`;
  const rescanHref = `${PAGE}${serializeMatchQuery({ ...query, go: true })}`;

  return (
    <div className="container-page pb-24 pt-8 sm:pt-12">
      <Link href="/teams" className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Cari tim
      </Link>
      <FeatureHero
        note="Pencocokan tim"
        title="Pasangan timmu"
        description="Diurutkan dari yang paling cocok denganmu. Buka rincian di tiap kartu untuk melihat dari mana skornya datang."
        actions={
          <Link href={rescanHref} className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'rounded-pill')}>
            <RefreshCw aria-hidden /> Cari ulang
          </Link>
        }
      />

      <ActionFeedback params={params} className="mt-8 max-w-2xl" />
      {hasFeedback && !scanning && <ScrollToTop key={randomUUID()} />}

      <div className="mt-8 flex flex-col gap-4">
        <CardSummary user={user} profile={profile} />
        <MatchFilters query={query} hasCity={profile.city !== null} />
      </div>

      <section id={RESULTS_ID} tabIndex={-1} aria-labelledby="hasil-judul" className={cn('relative mt-10 scroll-mt-32 outline-none sm:scroll-mt-24', scanning && 'min-h-[520px]')}>
        {scanning && (
          <>
            <ScanSession targetId={RESULTS_ID} />
            <div aria-hidden className="scan-overlay absolute inset-0 z-10 rounded-[28px] border border-line bg-panel">
              {/* sticky: area hasil bisa setinggi tiga layar; radar tetap di layar selama pemindaian. */}
              <div className="sticky top-24 flex flex-col items-center gap-6 px-4 py-8">
                <MatchRadar
                  you={{ seed: user.id, name: user.fullName }}
                  blips={matches.slice(0, 6).map((match) => ({ seed: match.candidate.person.userId, name: match.candidate.person.fullName }))}
                />
                <div className="relative h-6 w-full max-w-md text-center text-[15px] font-medium text-ink-soft">
                  {SCAN_LINES.map((line, index) => (
                    <p key={line} className="scan-line absolute inset-x-0" style={{ '--i': index } as CSSProperties}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <div className={cn('flex flex-col gap-8', scanning && 'scan-results')}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <h2 id="hasil-judul" className="font-display text-[26px] font-bold tracking-[-0.03em]">
                {best ? 'Pasangan terbaik untukmu' : 'Belum ada yang cocok'}
              </h2>
              <p className="text-[14px] text-ink-muted">
                {candidates.length === 0
                  ? 'Belum ada pemain lain yang membuka kartunya.'
                  : `${qualified.length} dari ${candidates.length} pemain lolos saringanmu${qualified.length > matches.length ? ` · ${matches.length} teratas ditampilkan` : ''}.`}
              </p>
            </div>
            {others.length > 0 && (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
                <Sparkles aria-hidden className="size-3.5" /> Tombol Lewati hanya menyembunyikan kartu di halaman ini.
              </p>
            )}
          </div>

          {best ? (
            <>
              <MatchCard match={best} returnTo={returnTo} categoryName={categoryName} featured scanning={scanning} focusTargetId={RESULTS_ID} />
              {others.length > 0 && (
                <section aria-labelledby="kandidat-lain" className="flex flex-col gap-4">
                  <h2 id="kandidat-lain" className="text-[19px] font-bold tracking-[-0.02em]">
                    Kandidat lain
                  </h2>
                  <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
                    {others.map((match, index) => (
                      <li key={match.candidate.person.userId}>
                        <MatchCard match={match} returnTo={returnTo} categoryName={categoryName} index={index + 1} scanning={scanning} focusTargetId={RESULTS_ID} />
                      </li>
                    ))}
                  </ul>
                  {canShowMore && (
                    <Link href={moreHref} scroll={false} className={cn(buttonVariants({ variant: 'secondary' }), 'self-center')}>
                      Tampilkan {Math.min(MATCH_PAGE_SIZE, qualified.length - matches.length)} lagi
                    </Link>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-line bg-panel px-6 py-14 text-center">
              <Filter aria-hidden className="size-8 text-ink-faint" />
              <h3 className="text-lg font-semibold">{candidates.length === 0 ? 'Kamu pemain pertama di sini' : 'Saringanmu terlalu ketat'}</h3>
              <p className="max-w-md text-sm text-ink-muted">
                {candidates.length === 0
                  ? 'Ajak temanmu membuka kartu pemain mereka — begitu ada yang bergabung, radar langsung menemukannya.'
                  : 'Coba perluas jarak, kurangi keahlian wajib, atau izinkan kerja daring.'}
              </p>
              {candidates.length > 0 && (
                <Link href={`${PAGE}?cari=1`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Hapus semua saringan
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
