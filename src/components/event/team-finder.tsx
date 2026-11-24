import Link from 'next/link';
import { ArrowRight, Handshake, MessageCircle, Send, Share2, Users } from 'lucide-react';
import { requestConnectionAction } from '@/app/connections/actions';
import { shareEventAction } from '@/app/events/[slug]/bagikan/actions';
import { Avatar } from '@/components/ui/avatar';
import { SubmitButton } from '@/components/ui/submit-button';
import type { AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { institutionDisplayName } from '@/lib/institution-kinds';
import { institutionById } from '@/lib/institutions';
import { DEFAULT_MATCH_FILTERS, MATCH_CANDIDATE_WINDOW, rankCandidates, type Match, type MatchViewer } from '@/lib/matchmaking';
import { digestRowOf, portfolioDigestOf } from '@/lib/portfolio';
import { loginHref } from '@/lib/safe-redirect';
import { CROSS_CAMPUS_PARAM, CROSS_CAMPUS_VALUE, pickTeamFinderMatches, teamInviteMessage, whatsappInviteHref } from '@/lib/team-finder';
import { cn } from '@/lib/utils';
import { skillLabel, type EventDetail, type PublicProfileDetails } from '@/types/domain';

/** Calon rekan yang detail tempat studinya dibaca — cukup untuk 3 kartu setelah saringan kampus lain. */
const DETAIL_WINDOW = 40;

const linkButton =
  'flex h-11 items-center gap-1.5 rounded-card border border-line-strong/70 bg-panel px-3.5 text-sm font-semibold transition-colors duration-150 ease-snap hover:border-brand';

function WhatsAppInvite({ event, eventUrl }: { event: EventDetail; eventUrl: string }) {
  return (
    <a href={whatsappInviteHref(event.title, eventUrl)} target="_blank" rel="noopener noreferrer" className={linkButton}>
      <MessageCircle aria-hidden className="size-4" /> Ajak teman via WhatsApp
      <span className="sr-only">(tab baru)</span>
    </a>
  );
}

function FilterLinks({ base, crossCampus }: { base: string; crossCampus: boolean }) {
  const items = [
    { label: 'Semua', href: `${base}#cari-rekan`, active: !crossCampus },
    { label: 'Kampus lain', href: `${base}?${CROSS_CAMPUS_PARAM}=${CROSS_CAMPUS_VALUE}#cari-rekan`, active: crossCampus },
  ];
  return (
    <nav aria-label="Saring calon rekan" className="flex gap-1 rounded-pill bg-panel-nested p-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          scroll={false}
          aria-current={item.active ? 'true' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center rounded-pill px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-snap pointer-coarse:min-h-11',
            item.active ? 'bg-panel text-ink shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function CandidateCard({ match, event, institution, returnTo }: { match: Match; event: EventDetail; institution: string | null; returnTo: string }) {
  const { person, skills, relation } = match.candidate;
  const highlighted = new Set(match.matchedSeeking);
  const shown = [...skills].sort((a, b) => Number(highlighted.has(b)) - Number(highlighted.has(a))).slice(0, 3);
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-line bg-panel p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={person.fullName} seed={person.userId} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{person.fullName}</span>
          <span className="min-w-0 text-[12.5px] text-ink-muted [overflow-wrap:anywhere]">{institution ?? 'Tempat studi belum diisi'}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-lg font-bold tabular-nums">{match.score}%</span>
          <span className="text-[11.5px] text-ink-muted">cocok</span>
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((skill) => (
            <li
              key={skill}
              className={cn(
                'inline-flex h-7 items-center rounded-pill px-2.5 text-[12.5px] font-medium',
                highlighted.has(skill) ? 'bg-highlight-soft font-semibold text-ink' : 'bg-panel-nested text-ink-soft',
              )}
            >
              {skillLabel(skill)}
            </li>
          ))}
        </ul>
      )}
      {match.reasons[0] && <p className="text-[12.5px] leading-snug text-ink-muted">{match.reasons[0]}</p>}
      {relation === 'connected' ? (
        <form action={shareEventAction}>
          <input type="hidden" name="slug" value={event.slug} />
          <input type="hidden" name="recipient" value={person.userId} />
          <SubmitButton className={cn(linkButton, 'w-full justify-center')} pendingLabel="Mengirim…">
            <Send aria-hidden className="size-4" /> Kirim lomba ini ke {person.fullName.split(' ')[0]}
          </SubmitButton>
        </form>
      ) : relation === 'outgoing' ? (
        <p className="flex h-11 items-center justify-center gap-1.5 rounded-card bg-panel-nested text-sm font-medium text-ink-muted">Ajakanmu menunggu jawaban</p>
      ) : relation === 'incoming' ? (
        <Link href="/connections?tab=ajakan" className={cn(linkButton, 'justify-center')}>
          Ia mengajakmu — jawab di Koneksi
        </Link>
      ) : (
        <form action={requestConnectionAction}>
          <input type="hidden" name="targetId" value={person.userId} />
          <input type="hidden" name="message" value={teamInviteMessage(event.title)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className="flex h-11 w-full items-center justify-center gap-1.5 rounded-card bg-brand px-3.5 text-sm font-semibold text-on-brand hover:bg-brand-hover" pendingLabel="Mengirim…">
            <Handshake aria-hidden className="size-4" /> Ajak setim
          </SubmitButton>
        </form>
      )}
    </li>
  );
}

/**
 * "Cari rekan tim" di halaman lomba (ADR-098). Memakai pencocokan keahlian
 * yang sudah ada (`rankCandidates`, kartu pemain ADR-057) — timbal-balik:
 * tanpa kartu terbuka, tidak ada kandidat, dan yang tampil adalah ajakan
 * membuka kartu. "Ajak setim" = permintaan terhubung berisi nama lomba;
 * yang sudah terhubung dikirimi lombanya lewat notifikasi (ADR-092).
 */
export async function TeamFinder({
  user,
  event,
  crossCampus,
  eventUrl,
  intro,
  openTeams,
}: {
  user: AuthUser | null;
  event: EventDetail;
  crossCampus: boolean;
  eventUrl: string;
  /** Kalimat jumlah tim terbuka (`teamEventInvite`, ADR-094); null = tidak dimuat. */
  intro: string | null;
  openTeams: number | null;
}) {
  const teamsLabel = openTeams && openTeams > 0 ? `Lihat ${openTeams.toLocaleString('id-ID')} tim terbuka` : 'Tim terbuka di lomba ini';
  const base = `/events/${event.slug}`;
  const returnTo = `${base}${crossCampus ? `?${CROSS_CAMPUS_PARAM}=${CROSS_CAMPUS_VALUE}` : ''}#cari-rekan`;

  if (!user) {
    return (
      <section id="cari-rekan" aria-labelledby="cari-rekan-title" className="flex scroll-mt-24 flex-col gap-3 rounded-[14px] bg-panel-nested p-[18px]">
        <h2 id="cari-rekan-title" className="flex items-center gap-2 text-base font-semibold">
          <Users aria-hidden className="size-[18px]" /> Cari rekan tim lintas kampus
        </h2>
        <p className="text-sm leading-normal text-ink-soft">
          {intro ?? 'Lomba ini diikuti per tim.'} Masuk untuk melihat calon rekan yang keahliannya melengkapi timmu, termasuk dari kampus lain.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={loginHref(returnTo)} className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
            Masuk untuk melihat calon rekan
          </Link>
          <WhatsAppInvite event={event} eventUrl={eventUrl} />
        </div>
      </section>
    );
  }

  const repository = await getEventRepository();
  const seeker = await withFallback('kartu pemain', () => repository.getSeekerProfile(user.id), null);
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="cari-rekan-title" className="flex items-center gap-2 text-base font-semibold">
        <Users aria-hidden className="size-[18px]" /> Cari rekan tim
      </h2>
      {seeker?.open && <FilterLinks base={base} crossCampus={crossCampus} />}
      {intro && <p className="w-full text-sm leading-normal text-ink-soft">{intro}</p>}
    </div>
  );

  if (!seeker?.open) {
    return (
      <section id="cari-rekan" aria-labelledby="cari-rekan-title" className="flex scroll-mt-24 flex-col gap-3 rounded-[14px] bg-panel-nested p-[18px]">
        {header}
        <p className="text-sm leading-normal text-ink-soft">
          Pencocokan bersifat timbal-balik: buka kartu pemainmu (keahlian yang kamu bawa & yang kamu cari) untuk melihat calon rekan
          lomba ini, termasuk dari kampus lain.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/teams/cocok?ubah=1" className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
            <Handshake aria-hidden className="size-4" /> Buka kartu pemain
          </Link>
          <WhatsAppInvite event={event} eventUrl={eventUrl} />
        </div>
      </section>
    );
  }

  const [candidates, trackerItems, categories, study] = await Promise.all([
    withFallback('calon rekan', () => repository.listSeekerCandidates(user.id, MATCH_CANDIDATE_WINDOW.default), []),
    withFallback('papan lamaran', () => repository.listTrackerItems(user.id), []),
    withFallback('kategori', () => repository.listCategories(), []),
    withFallback('tempat studi', () => repository.getStudyProfile(user.id), null),
  ]);
  const viewer: MatchViewer = {
    userId: user.id,
    educationLevel: user.educationLevel,
    major: user.major,
    interests: user.interests,
    profile: seeker,
    portfolio: portfolioDigestOf(trackerItems.map(digestRowOf)),
  };
  const categoryName = (slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug;
  const ranked = rankCandidates(viewer, candidates, { style: 'seimbang', filters: DEFAULT_MATCH_FILTERS, categoryName, limit: DETAIL_WINDOW });
  const details = await withFallback(
    'tempat studi calon rekan',
    () => repository.listPublicProfileDetails(user.id, ranked.map((match) => match.candidate.person.userId)),
    new Map<string, PublicProfileDetails>(),
  );
  const institutionOf = (userId: string) => details.get(userId)?.institutionId ?? null;
  const picks = pickTeamFinderMatches(ranked, {
    eventCategories: event.categorySlugs,
    viewerInstitutionId: study?.institutionId ?? null,
    institutionOf,
    crossCampus,
  });
  const labelOf = (userId: string) => {
    const detail = details.get(userId);
    const hit = detail?.institutionId ? institutionById(detail.institutionId) : null;
    return hit ? institutionDisplayName(hit.name, hit.short) : (detail?.institutionName ?? null);
  };

  return (
    <section id="cari-rekan" aria-labelledby="cari-rekan-title" className="flex scroll-mt-24 flex-col gap-4 rounded-[14px] border border-line p-[18px]">
      {header}
      {crossCampus && !study?.institutionId ? (
        <p className="text-sm leading-normal text-ink-soft">
          Isi kampus/sekolahmu di{' '}
          <Link href="/profile/details?ubah=asal#asal" className="font-semibold text-ink underline underline-offset-[3px]">
            Data diri
          </Link>{' '}
          supaya kami tahu mana yang dari kampus lain.
        </p>
      ) : picks.length === 0 ? (
        <p className="text-sm leading-normal text-ink-soft">
          {crossCampus ? 'Belum ada calon rekan dari kampus lain yang kartunya terbuka.' : 'Belum ada calon rekan yang kartunya terbuka.'} Coba lagi
          nanti, atau ajak temanmu langsung.
        </p>
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]">
          {picks.map((match) => (
            <CandidateCard key={match.candidate.person.userId} match={match} event={event} institution={labelOf(match.candidate.person.userId)} returnTo={returnTo} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link href="/teams/cocok" className={linkButton}>
          Lihat semua calon rekan <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Link href={`/teams?kegiatan=${encodeURIComponent(event.slug)}`} className={linkButton}>
          <Share2 aria-hidden className="size-4" /> {teamsLabel}
        </Link>
        <WhatsAppInvite event={event} eventUrl={eventUrl} />
      </div>
    </section>
  );
}

/**
 * Kerangka "Cari rekan tim" selama kandidatnya dihitung (ADR-099). Bagian ini
 * satu-satunya di halaman detail yang mengalir belakangan (Suspense) — hanya
 * untuk anggota yang sudah masuk, karena isi tamu tidak butuh data. Status
 * HTTP & `notFound()` sudah diputuskan sebelum batas ini, jadi tidak ada
 * soft-404 (lihat `src/app/events/page.tsx`). Tingginya mendekati hasil akhir
 * supaya isi di bawahnya tidak melompat saat kandidat tiba.
 */
export function TeamFinderSkeleton() {
  return (
    <section id="cari-rekan" aria-labelledby="cari-rekan-title" aria-busy="true" className="flex scroll-mt-24 flex-col gap-4 rounded-[14px] border border-line p-[18px]">
      <h2 id="cari-rekan-title" className="flex items-center gap-2 text-base font-semibold">
        <Users aria-hidden className="size-[18px]" /> Cari rekan tim
      </h2>
      <p className="sr-only" role="status">
        Memuat calon rekan tim…
      </p>
      {/* Isi yang mengalir belakangan baru ditampilkan oleh JavaScript; tanpa JS kerangka ini tidak pernah terganti. */}
      <noscript>
        <p className="text-sm leading-normal text-ink-soft">
          Calon rekan dimuat dengan JavaScript.{' '}
          <Link href="/teams/cocok" className="font-semibold text-ink underline underline-offset-[3px]">
            Buka pencocokan tim
          </Link>
        </p>
      </noscript>
      <span aria-hidden className="shimmer block h-11 w-56 max-w-full rounded-pill" />
      <ul aria-hidden className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]">
        {[0, 1, 2].map((index) => (
          <li key={index} className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-line bg-panel p-4">
            <span className="flex items-center gap-3">
              <span className="shimmer block size-10 shrink-0 rounded-pill" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="shimmer block h-3.5 w-3/4 rounded-pill" />
                <span className="shimmer block h-3 w-1/2 rounded-pill" />
              </span>
            </span>
            <span className="flex gap-1.5">
              <span className="shimmer block h-7 w-24 rounded-pill" />
              <span className="shimmer block h-7 w-20 rounded-pill" />
            </span>
            <span className="shimmer block h-11 w-full rounded-card" />
          </li>
        ))}
      </ul>
    </section>
  );
}
