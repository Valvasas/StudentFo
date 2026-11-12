import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AtSign, Check, Flag, GraduationCap, Info, UserPlus } from 'lucide-react';
import { requestConnectionAction } from '@/app/connections/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { CategoryIcon, shortCategoryName } from '@/components/listing/category-icon';
import { PortfolioList } from '@/components/profile/portfolio-list';
import { ProfileBanner } from '@/components/profile/profile-banner';
import { loadProfileMedia } from '@/components/profile/profile-media-loader';
import { Avatar } from '@/components/ui/avatar';
import { PublicBadges } from '@/components/profile/public-badges';
import { StudyPlaceLine } from '@/components/profile/study-place';
import { CopyCodeButton } from '@/components/registration/copy-code-button';
import { BackLink } from '@/components/ui/back-link';
import { SubmitButton } from '@/components/ui/submit-button';
import { evaluateBadges } from '@/lib/achievements';
import type { AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { withFallback } from '@/lib/fallback';
import type { RawSearchParams } from '@/lib/search-params';
import { presentStudyProfile } from '@/lib/study-profile';
import { EDUCATION_LEVEL_LABEL, type ProfileRelation, type PublicProfile, type PublicProfileDetails } from '@/types/domain';

const RELATION_TEXT: Record<Exclude<ProfileRelation, null | 'self'>, string> = {
  connected: 'Terhubung denganmu',
  incoming: 'Mengajakmu terhubung',
  outgoing: 'Ajakanmu menunggu jawaban',
};

/**
 * Profil publik seseorang (ADR-046, ADR-077) — dipakai `/u/[username]` dan
 * `/orang/[id]`. Aturan kelihatannya ada di repository/SQL
 * (`can_view_profile`: profil terbuka untuk anggota, bisa ditemukan, atau
 * berkoneksi; tidak saling memblokir) — halaman ini tidak menambah jalur
 * baca sendiri. Tidak boleh dilihat dan tidak ada sama-sama 404.
 */
export async function PublicProfileView({
  viewer,
  profile,
  details,
  selfPath,
  query,
}: {
  viewer: AuthUser;
  profile: PublicProfile | null;
  details: PublicProfileDetails | null;
  selfPath: string;
  query: RawSearchParams;
}) {
  if (!profile) notFound();
  const repository = await getEventRepository();
  const { person, relation, portfolio } = profile;
  const [categories, badgeFacts, media] = await Promise.all([
    repository.listCategories(),
    withFallback('lencana publik', () => repository.listPublicBadgeFacts(viewer.id, [person.userId]), new Map()),
    loadProfileMedia(viewer.id, [person.userId]),
  ]);
  const look = media.get(person.userId) ?? null;
  const interests = person.interests
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const now = new Date();
  // Hanya ada bila pemiliknya menyalakan "tampilkan lencanaku" (ADR-072); dihitung aturan yang sama dengan profilnya sendiri.
  const facts = badgeFacts.get(person.userId);
  const badges = facts ? evaluateBadges(facts, now) : null;
  const studyView = details ? presentStudyProfile(details) : null;
  const shareUrl = details?.username ? `${siteUrl.replace(/\/$/, '')}/u/${details.username}` : null;

  return (
    <div className="container-page flex max-w-3xl flex-col gap-6 pb-16 pt-8">
      <BackLink href="/connections" label="Koneksi" via={[{ href: '/teams/cocok', label: 'Cocokkan tim' }]} className="-mb-2" />

      <ActionFeedback params={query} />

      <section aria-labelledby="nama-orang" className="enter flex flex-col gap-4 overflow-hidden rounded-[20px] border border-line px-5 pb-5 sm:px-7 sm:pb-7">
        <ProfileBanner media={look} className="-mx-5 h-[92px] sm:-mx-7 sm:h-[116px]" />
        <div className="-mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <Avatar name={person.fullName} seed={person.userId} photo={look?.avatarId} size="xl" className="-mt-[46px] ring-4 ring-canvas" />
          {relation && relation !== 'self' ? (
            <span className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-panel-nested px-3 text-[13px] font-medium">
              {relation === 'connected' && <Check aria-hidden className="size-4" />}
              {RELATION_TEXT[relation]}
              {relation === 'incoming' && (
                <Link href="/connections?tab=ajakan#ajakan-masuk" className="ml-1 underline underline-offset-[3px]">
                  Jawab
                </Link>
              )}
            </span>
          ) : (
            <form action={requestConnectionAction} className="mt-3">
              <input type="hidden" name="targetId" value={person.userId} />
              <input type="hidden" name="returnTo" value={selfPath} />
              <SubmitButton className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                <UserPlus aria-hidden className="size-4" /> Hubungkan
                <span className="sr-only"> dengan {person.fullName}</span>
              </SubmitButton>
            </form>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 id="nama-orang" className="break-words text-[clamp(28px,4vw,36px)] leading-[1.05] tracking-[-0.04em]">
            {person.fullName}
          </h1>
          {details?.username && (
            <p className="flex items-center gap-1 text-[14.5px] font-medium text-ink-muted">
              <AtSign aria-hidden className="size-4" />
              <span className="sr-only">Username: </span>
              {details.username}
            </p>
          )}
          {person.headline && <p className="text-base text-ink-soft">{person.headline}</p>}
        </div>
        {details?.bio && <p className="max-w-[62ch] whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-soft">{details.bio}</p>}
        <p className="flex items-center gap-1.5 text-[13.5px] text-ink-muted">
          <GraduationCap aria-hidden className="size-4 shrink-0" />
          {[person.major, person.educationLevel ? EDUCATION_LEVEL_LABEL[person.educationLevel] : null].filter(Boolean).join(' · ') ||
            'Program studi & jenjang belum diisi'}
        </p>
        {studyView && <StudyPlaceLine view={studyView} withFields />}
        {badges && <PublicBadges progress={badges} />}
        {interests.length > 0 && (
          <ul aria-label="Minat" className="flex flex-wrap gap-1.5">
            {interests.map((category) => (
              <li key={category.slug} className="flex h-[30px] items-center gap-1.5 rounded-sm bg-panel-nested px-[11px] text-[13px] font-medium">
                <CategoryIcon slug={category.slug} />
                {shortCategoryName(category.name)}
              </li>
            ))}
          </ul>
        )}
        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="min-w-0 flex-1 select-all break-all text-[13px] text-ink-muted">{shareUrl}</span>
            <CopyCodeButton code={shareUrl} label="tautan profil" />
          </div>
        )}
      </section>

      <section aria-labelledby="portofolio-orang" className="flex flex-col gap-1.5 rounded-[18px] border border-line p-5 sm:p-6">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="portofolio-orang" className="text-base font-semibold">
            Portofolio
          </h2>
          <span className="text-[12.5px] text-ink-muted">{portfolio.length} kegiatan</span>
        </div>
        <PortfolioList rows={portfolio.map((entry) => ({ entry }))} now={now} emptyText="Belum ada kegiatan yang ditampilkan." />
        {portfolio.length > 0 && (
          <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-normal text-ink-muted">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Dicatat pemilik profil dari pendaftarannya di StudentFo. Hasil (juara, finalis, dst.) dilaporkan sendiri dan belum
            diverifikasi penyelenggara — cek tautan bukti bila ada.
          </p>
        )}
      </section>

      {relation !== 'self' && (
        <Link
          href={`/laporkan?orang=${encodeURIComponent(person.userId)}`}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
        >
          <Flag aria-hidden className="size-3.5" /> Laporkan pengguna ini
        </Link>
      )}
    </div>
  );
}
