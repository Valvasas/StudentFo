import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Armchair, CalendarClock, Clock, Plus, UserRoundSearch, UsersRound } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { DemoTeamRoles } from '@/components/profile/demo-profile-parts';
import { MyTeamLink, TeamCard } from '@/components/team/team-card';
import { Avatar } from '@/components/ui/avatar';
import { FeatureHero, IllustrationStage, StatTile } from '@/components/ui/feature-hero';
import { TeamHuddleSketch } from '@/components/ui/feature-illustrations';
import { SelectInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, remainingSlots } from '@/types/domain';

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

const primaryAction =
  'inline-flex h-12 items-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover';
const secondaryAction =
  'inline-flex h-12 items-center gap-2 rounded-pill border border-line-strong/70 bg-panel px-5 text-[15px] font-semibold transition-colors duration-150 hover:bg-panel-nested';

export default async function TeamsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);
  const slug = firstParam(params.kegiatan);
  const scoped = slug ? await repository.getEventBySlug(slug) : null;
  const allTeams = await repository.listTeams();

  const inScope = (scoped ? allTeams.filter((team) => team.eventId === scoped.id) : allTeams)
    .slice()
    .sort((left, right) => Number(remainingSlots(right) > 0) - Number(remainingSlots(left) > 0));
  const mine = user ? inScope.filter((team) => team.members.some((member) => member.userId === user.id)) : [];
  // Tim sendiri sudah punya pintasan di atas; mengulangnya di daftar = satu fakta di dua tempat (ADR-044).
  const teams = inScope.filter((team) => !mine.includes(team));

  // Pilihan saringan: hanya kegiatan yang punya tim, supaya tidak ada pilihan yang berujung kosong.
  const eventChips = [...new Map(allTeams.filter((team) => team.event).map((team) => [team.eventId, team.event!])).values()];
  const openTeams = inScope.filter((team) => remainingSlots(team) > 0).length;
  const openSeats = inScope.reduce((sum, team) => sum + remainingSlots(team), 0);
  const now = new Date();
  const returnTo = scoped ? `/teams?kegiatan=${scoped.slug}` : '/teams';
  const createHref = scoped ? `/teams/baru?kegiatan=${encodeURIComponent(scoped.slug)}` : '/teams/baru';
  const profileLine = user ? [user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ') : '';

  return (
    <div className="container-page pb-24 pt-8 sm:pt-12">
      {scoped && (
        <Link href={`/events/${scoped.slug}`} className="-mt-2 mb-4 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> {scoped.title}
        </Link>
      )}

      <FeatureHero
        note={scoped ? `${EVENT_TYPE_LABEL[scoped.eventType].toLowerCase()} oleh ${scoped.organizer}` : 'cari kawan seperjuangan'}
        title={
          <>
            Cari <span className="marker">tim</span>
          </>
        }
        description={
          scoped
            ? `Tim untuk ${scoped.title}. Gabung ke tim yang masih butuh orang, atau buka timmu sendiri dan sebutkan peran yang kamu cari.`
            : 'Banyak lomba mensyaratkan tim. Buka timmu, sebutkan siapa yang kamu cari, lalu biarkan orang yang cocok bergabung.'
        }
        actions={
          user ? (
            <>
              <Link href={createHref} className={primaryAction}>
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
              <p className="max-w-[34ch] text-[13.5px] leading-snug text-ink-muted">Tamu bisa melihat tim, tapi nama anggota hanya untuk yang sudah masuk.</p>
            </>
          )
        }
        stage={
          scoped?.primaryDeadlineAt ? (
            <div className="flex flex-col gap-3">
              <IllustrationStage tint="sun" className="pb-2 pt-6">
                <TeamHuddleSketch className="max-w-[300px]" />
              </IllustrationStage>
              <div className="flex items-center gap-4 rounded-[22px] bg-inverse px-6 py-5 text-on-inverse">
                <Clock aria-hidden className="size-6 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-on-inverse-muted">Pendaftaran tutup</span>
                  <span className="text-xl font-semibold tracking-[-0.02em]">{formatDateId(scoped.primaryDeadlineAt)}</span>
                  <span className="text-[13px] text-on-inverse-muted">{daysLeftLabel(daysUntil(scoped.primaryDeadlineAt, now))}</span>
                </span>
              </div>
            </div>
          ) : (
            <IllustrationStage tint="sun">
              <TeamHuddleSketch />
            </IllustrationStage>
          )
        }
      >
        {user && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-line bg-panel p-3 pr-5">
            <span className="flex min-w-0 flex-1 basis-60 items-center gap-3">
              <Avatar name={user.fullName} seed={user.id} size="md" />
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
        <StatTile icon={UsersRound} value={openTeams} label="tim masih butuh orang" index={0} />
        <StatTile icon={Armchair} value={openSeats} label="kursi kosong menunggu" index={1} />
        <StatTile icon={CalendarClock} value={scoped ? 1 : eventChips.length} label={scoped ? 'kegiatan dipilih' : 'kegiatan punya tim'} index={2} />
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
                <TeamCard team={team} currentUserId={user?.id ?? null} returnTo={returnTo} showEvent={!scoped} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
