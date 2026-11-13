import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Armchair, CalendarClock, Clock, Plus, Radar, UserRoundSearch, UsersRound } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { DemoTeamRoles } from '@/components/profile/demo-profile-parts';
import { avatarIdsOf, loadProfileMedia } from '@/components/profile/profile-media-loader';
import { MyTeamLink, TeamCard } from '@/components/team/team-card';
import { Avatar } from '@/components/ui/avatar';
import { FeatureHero, IllustrationStage, StatTile } from '@/components/ui/feature-hero';
import { TeamHuddleSketch } from '@/components/ui/feature-illustrations';
import { SelectInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { TEAM_LIST_LIMIT, type EventRepository } from '@/lib/data/repository';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, remainingSlots, type Team, type TeamLink } from '@/types/domain';

/**
 * Cari tim (kanvas Cari Tim, ditata ulang di ADR-054).
 *
 * Dirender dinamis karena kartunya menampilkan sisa tenggat kegiatan, dan
 * daftar anggotanya berubah begitu ada yang bergabung. `?kegiatan=<slug>`
 * mempersempit ke satu kegiatan seperti kanvas (dibuka dari halaman detail
 * atau status pendaftaran). Tab "Peserta solo" di kanvas belum ada: butuh
 * tabel profil pencari tim di database (TASKS.md).
 *
 * Membuka tim punya halamannya sendiri (`/teams/baru`). Form yang dulu
 * terlipat di kolom samping 300px membuat halaman ini terasa sesak dan
 * memaksa daftar tim berbagi lebar dengan pengisian form.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cari tim',
  description: 'Temukan rekan satu tim untuk lomba, hackathon, dan karya tulis — atau buka timmu sendiri dan tunggu yang tertarik bergabung.',
};

/** Batas id foto per halaman: 3 panggilan `public_profile_media` (100 id per panggilan). Kartu di luar jendela tampil berinisial. */
const TEAM_PHOTO_WINDOW = 300;

/** Pintasan "Tim kamu" paling banyak sekian tim; halaman tiap tim tetap bisa dibuka dari profil & notifikasi. */
const MY_TEAMS_SHOWN = 12;

const newestFirst = (left: Team, right: Team) => Date.parse(right.createdAt) - Date.parse(left.createdAt);
const openFirst = (left: Team, right: Team) => Number(remainingSlots(right) > 0) - Number(remainingSlots(left) > 0);

/**
 * Tim yang diikuti pembaca, dari keanggotaan sungguhan — bukan saringan atas
 * jendela `listTeams` (tim lama di luar 60 terbaru dulu "hilang" dari sini).
 * Yang sudah ada di jendela dipakai ulang; sisanya satu kueri `listTeamsByIds`.
 */
async function loadMyTeams(repository: EventRepository, userId: string, links: readonly TeamLink[], pool: readonly Team[], eventId: string | null) {
  const isMine = (team: Team) => team.members.some((member) => member.userId === userId);
  const inPool = pool.filter(isMine);
  const known = new Set(inPool.map((team) => team.id));
  const missing = links.filter((link) => (eventId === null || link.event.id === eventId) && !known.has(link.teamId)).map((link) => link.teamId);
  const fetched = missing.length > 0 ? (await repository.listTeamsByIds(missing)).filter(isMine) : [];
  return [...inPool, ...fetched].sort(newestFirst).sort(openFirst).slice(0, MY_TEAMS_SHOWN);
}

const primaryAction =
  'inline-flex h-12 items-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover';
const secondaryAction =
  'inline-flex h-12 items-center gap-2 rounded-pill border border-line-strong/70 bg-panel px-5 text-[15px] font-semibold transition-colors duration-150 hover:bg-panel-nested';

export default async function TeamsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);
  const slug = firstParam(params.kegiatan);
  const scoped = slug ? await repository.getEventBySlug(slug) : null;
  // Per kegiatan diminta langsung ke database: menyaring jendela tim terbaru
  // global membuat tim lama sebuah kegiatan tampak tidak ada.
  const [allTeams, scopedTeams, myLinks] = await Promise.all([
    repository.listTeams(),
    scoped ? repository.listTeams(scoped.id) : null,
    user ? repository.listTeamLinks([user.id], TEAM_LIST_LIMIT) : [],
  ]);
  const pool = scopedTeams ?? allTeams;
  const truncated = pool.length >= TEAM_LIST_LIMIT;

  const inScope = pool.slice().sort(openFirst);
  const mine = user ? await loadMyTeams(repository, user.id, myLinks, inScope, scoped?.id ?? null) : [];
  const mineIds = new Set(mine.map((team) => team.id));
  // Tim sendiri sudah punya pintasan di atas; mengulangnya di daftar = satu fakta di dua tempat (ADR-044).
  const teams = inScope.filter((team) => !mineIds.has(team.id));
  // Foto profil (ADR-083) hanya untuk kursi yang benar-benar digambar (maks. 6 per kartu).
  const photos = user
    ? avatarIdsOf(
        await loadProfileMedia(
          user.id,
          [...mine, ...teams].flatMap((team) => team.members.slice(0, 6).map((member) => member.userId)).slice(0, TEAM_PHOTO_WINDOW),
        ),
      )
    : {};

  // Pilihan saringan: hanya kegiatan yang punya tim, supaya tidak ada pilihan yang berujung kosong.
  // Kegiatan yang sedang dipilih selalu ikut: timnya bisa lebih tua dari jendela global, dan <select>
  // tanpa opsi yang cocok diam-diam menampilkan "Semua kegiatan" padahal daftarnya tersaring.
  const eventChips = [
    ...new Map([
      ...allTeams.filter((team) => team.event).map((team) => [team.eventId, team.event!] as const),
      ...(scoped ? [[scoped.id, scoped] as const] : []),
    ]).values(),
  ];
  const openTeams = inScope.filter((team) => remainingSlots(team) > 0).length;
  const openSeats = inScope.reduce((sum, team) => sum + remainingSlots(team), 0);
  // Angka dari jendela yang terpotong = batas bawah; "60+" lebih jujur daripada "60".
  const atLeast = (value: number) => (truncated ? `${value}+` : value);
  const now = new Date();
  const returnTo = scoped ? `/teams?kegiatan=${scoped.slug}` : '/teams';
  const createHref = scoped ? `/teams/baru?kegiatan=${encodeURIComponent(scoped.slug)}` : '/teams/baru';
  const profileLine = user ? [user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ') : '';

  return (
    <div className="container-page pb-24 pt-8 sm:pt-12">
      {scoped && (
        <Link href={`/events/${scoped.slug}`} className="-mt-2 mb-4 flex min-h-11 w-fit max-w-full items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4 shrink-0" /> <span className="min-w-0 [overflow-wrap:anywhere]">{scoped.title}</span>
        </Link>
      )}

      <FeatureHero
        note={scoped ? `${EVENT_TYPE_LABEL[scoped.eventType]} · ${scoped.organizer}` : undefined}
        stage={
          <IllustrationStage tint="mint" className="min-h-[260px]">
            <TeamHuddleSketch />
          </IllustrationStage>
        }
        title="Cari tim"
        description={
          scoped
            ? `Tim untuk ${scoped.title}. Gabung ke tim yang masih butuh orang, atau buka timmu sendiri.`
            : 'Gabung ke tim yang masih butuh orang, atau buka timmu sendiri dan sebutkan peran yang kamu cari.'
        }
        actions={
          user ? (
            <>
              <Link href="/teams/cocok" className={primaryAction}>
                <Radar aria-hidden className="size-[18px]" /> Cocokkan otomatis
              </Link>
              <Link href={createHref} className={secondaryAction}>
                <Plus aria-hidden className="size-[18px]" strokeWidth={2.4} /> Buka tim baru
              </Link>
              <Link href="/connections" className={secondaryAction}>
                <UserRoundSearch aria-hidden className="size-[18px]" /> Cari orang
              </Link>
            </>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={primaryAction}>
                Masuk untuk bergabung
              </Link>
              <Link href="/login?next=%2Fteams%2Fcocok" className={secondaryAction}>
                <Radar aria-hidden className="size-[18px]" /> Cocokkan otomatis
              </Link>
              <p className="max-w-[34ch] text-[13.5px] leading-snug text-ink-muted">Tamu bisa melihat tim, tapi nama anggota hanya untuk yang sudah masuk.</p>
            </>
          )
        }
      >
        {scoped?.primaryDeadlineAt && (
          <div className="flex items-center gap-4 self-start rounded-[22px] bg-inverse px-6 py-4 text-on-inverse">
            <Clock aria-hidden className="size-6 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-on-inverse-muted">Pendaftaran tutup</span>
              <span className="text-lg font-semibold tracking-[-0.02em]">{formatDateId(scoped.primaryDeadlineAt)}</span>
              <span className="text-[13px] text-on-inverse-muted">{daysLeftLabel(daysUntil(scoped.primaryDeadlineAt, now))}</span>
            </span>
          </div>
        )}
        {user && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-line bg-panel p-3 pr-5">
            <span className="flex min-w-0 flex-1 basis-60 items-center gap-3">
              <Avatar name={user.fullName} seed={user.id} photo={user.profileMedia.avatarId} size="md" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[12px] text-ink-muted">Kamu tampil sebagai</span>
                <span className="truncate text-[14.5px] font-semibold">
                  {user.fullName}
                  {profileLine && <span className="font-normal text-ink-muted"> · {profileLine}</span>}
                </span>
              </span>
            </span>
            {demoFeaturesEnabled && <DemoTeamRoles />}
          </div>
        )}
      </FeatureHero>

      <div className="mt-10 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile icon={UsersRound} value={atLeast(openTeams)} label="tim masih butuh orang" index={0} />
        <StatTile icon={Armchair} value={atLeast(openSeats)} label="kursi kosong menunggu" index={1} />
        <StatTile icon={CalendarClock} value={scoped ? 1 : atLeast(eventChips.length)} label={scoped ? 'kegiatan dipilih' : 'kegiatan punya tim'} index={2} />
      </div>

      <ActionFeedback params={params} className="mt-8 max-w-2xl" />

      {mine.length > 0 && (
        <section aria-labelledby="tim-kamu" className="mt-14 flex flex-col gap-4">
          <h2 id="tim-kamu" className="text-[22px] font-bold tracking-[-0.025em]">
            Tim kamu
          </h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
            {mine.map((team, index) => (
              <li key={team.id} className="rise" style={{ '--i': index } as CSSProperties}>
                <MyTeamLink team={team} userId={user!.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="daftar-tim" className="mt-14 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1">
            <h2 id="daftar-tim" className="text-[26px] font-bold tracking-[-0.03em]">
              Tim yang mencari anggota
            </h2>
            <p className="text-[14px] text-ink-muted">
              {teams.length} tim{openTeams > 0 ? ' · yang masih butuh orang tampil lebih dulu' : ''}
            </p>
            {truncated && (
              <p className="text-[13px] text-ink-muted">
                {scoped
                  ? `Menampilkan ${TEAM_LIST_LIMIT} tim terbaru untuk kegiatan ini.`
                  : `Menampilkan ${TEAM_LIST_LIMIT} tim terbaru — pilih kegiatan untuk melihat semua timnya.`}
              </p>
            )}
          </div>

          {/* Satu pilihan per kegiatan yang punya tim — bisa puluhan. Sebagai
              chip, judulnya terpotong dan barisnya bergeser tanpa ujung; sebagai
              <select> native, semua judul terbaca utuh dan tetap satu baris.
              Form GET + tombol: jalan tanpa JavaScript (AGENTS.md §9). */}
          {eventChips.length > 1 && (
            <form method="get" action="/teams" aria-label="Saring kegiatan" className="flex w-full max-w-md flex-col gap-2 sm:w-auto sm:flex-row">
              <label className="flex-1 sm:w-72">
                <span className="sr-only">Kegiatan</span>
                <SelectInput name="kegiatan" defaultValue={scoped?.slug ?? ''} className="rounded-pill pl-4">
                  <option value="">Semua kegiatan ({eventChips.length})</option>
                  {eventChips.map((event) => (
                    <option key={event.id} value={event.slug}>
                      {event.title}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded-pill border border-line-strong/70 bg-panel px-5 text-sm font-semibold transition-colors duration-150 hover:bg-panel-nested"
              >
                Tampilkan
              </button>
            </form>
          )}
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-line-strong px-6 py-12 text-center">
            <TeamHuddleSketch className="max-w-[240px] text-ink-soft" />
            <p className="font-display text-xl font-semibold tracking-[-0.02em]">
              {mine.length > 0 ? 'Belum ada tim lain di sini.' : scoped ? 'Belum ada tim untuk kegiatan ini.' : 'Belum ada tim yang dibuka.'}
            </p>
            <p className="max-w-[44ch] text-sm leading-relaxed text-ink-muted">Kursi pertama selalu yang paling sulit diisi. Buka timmu — orang yang cocok bisa langsung bergabung.</p>
            {user && (
              <Link href={createHref} className={primaryAction}>
                <Plus aria-hidden className="size-[18px]" strokeWidth={2.4} /> Buka tim pertama
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr))]">
            {teams.map((team, index) => (
              <li key={team.id} className="rise" style={{ '--i': index } as CSSProperties}>
                <TeamCard team={team} currentUserId={user?.id ?? null} returnTo={returnTo} showEvent={!scoped} photos={photos} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
