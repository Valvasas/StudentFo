import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Clock, Plus } from 'lucide-react';
import { createTeamAction } from '@/app/teams/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { DemoTeamCard } from '@/components/profile/demo-profile-parts';
import { TeamCard } from '@/components/team/team-card';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { initialsOf } from '@/lib/initials';
import { firstParam, parseEventQuery, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, remainingSlots } from '@/types/domain';

/**
 * Cari tim (kanvas Cari Tim).
 *
 * Dirender dinamis karena kartunya menampilkan sisa tenggat kegiatan, dan
 * daftar anggotanya berubah begitu ada yang bergabung. `?kegiatan=<slug>`
 * mempersempit ke satu kegiatan seperti kanvas (dibuka dari halaman detail
 * atau status pendaftaran). Tab "Peserta solo" di kanvas belum ada: butuh
 * tabel profil pencari tim di database (TASKS.md).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cari tim',
  description: 'Temukan rekan satu tim untuk lomba, hackathon, dan karya tulis — atau buka timmu sendiri dan tunggu yang tertarik bergabung.',
};

const inputClass =
  'h-11 w-full rounded-card border border-line-strong/70 bg-panel px-3.5 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export default async function TeamsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);
  const slug = firstParam(params.kegiatan);
  const scoped = slug ? await repository.getEventBySlug(slug) : null;

  const [allTeams, openEvents] = await Promise.all([
    repository.listTeams(),
    // Tim hanya masuk akal untuk kegiatan yang masih terbuka. Diurutkan dari
    // tenggat terdekat supaya pilihan teratas adalah yang paling mendesak.
    user ? repository.listEvents({ ...parseEventQuery({}), sort: 'deadline', pageSize: 48 }) : Promise.resolve(null),
  ]);
  const teams = (scoped ? allTeams.filter((team) => team.eventId === scoped.id) : allTeams)
    .slice()
    .sort((left, right) => Number(remainingSlots(right) > 0) - Number(remainingSlots(left) > 0));

  // Chip kegiatan: hanya kegiatan yang punya tim, supaya tidak ada pilihan yang berujung kosong.
  const eventChips = [...new Map(allTeams.filter((team) => team.event).map((team) => [team.eventId, team.event!])).values()];
  const openCount = teams.filter((team) => remainingSlots(team) > 0).length;
  const mine = user ? teams.filter((team) => team.members.some((member) => member.userId === user.id)) : [];
  const now = new Date();
  const returnTo = scoped ? `/teams?kegiatan=${scoped.slug}` : '/teams';

  return (
    <div className="container-page pb-16 pt-10">
      {scoped ? (
        <Link href={`/events/${scoped.slug}`} className="-mt-2 mb-3 flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> {scoped.title}
        </Link>
      ) : null}

      <div className="grid items-end gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <header className="enter flex flex-col gap-3 [animation-duration:900ms]">
          <h1 className="text-[clamp(36px,5vw,52px)] leading-[1.02]">Cari tim</h1>
          <p className="max-w-[54ch] text-[15.5px] leading-relaxed text-ink-muted">
            {scoped
              ? `${EVENT_TYPE_LABEL[scoped.eventType]} oleh ${scoped.organizer}. Gabung ke tim yang masih butuh orang, atau buka timmu sendiri.`
              : 'Banyak lomba mensyaratkan tim. Buka timmu di sini, sebutkan siapa yang kamu cari, lalu biarkan orang yang cocok bergabung.'}
          </p>
        </header>
        {scoped?.primaryDeadlineAt ? (
          <div className="enter flex items-center gap-4 rounded-[18px] bg-inverse px-6 py-5 text-on-inverse [animation-delay:120ms] [animation-duration:900ms]">
            <Clock aria-hidden className="size-6 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-on-inverse-muted">Pendaftaran tutup</span>
              <span className="text-xl font-semibold tracking-[-0.02em]">{formatDateId(scoped.primaryDeadlineAt)}</span>
              <span className="text-[13px] text-on-inverse-muted">{daysLeftLabel(daysUntil(scoped.primaryDeadlineAt, now))}</span>
            </span>
          </div>
        ) : null}
      </div>

      <ActionFeedback params={params} className="mt-6 max-w-2xl" />

      {eventChips.length > 1 && (
        <nav aria-label="Saring kegiatan" className="mt-8 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <Link
            href="/teams"
            aria-current={!scoped ? 'page' : undefined}
            className={cn('flex min-h-11 shrink-0 items-center rounded-sm border px-3.5 text-[13.5px] font-medium', !scoped ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong')}
          >
            Semua kegiatan
          </Link>
          {eventChips.map((event) => {
            const active = scoped?.id === event.id;
            return (
              <Link
                key={event.id}
                href={`/teams?kegiatan=${event.slug}`}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-11 max-w-[260px] shrink-0 items-center rounded-sm border px-3.5 text-[13.5px] font-medium', active ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong')}
              >
                <span className="truncate">{event.title}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          {user ? (
            <section aria-labelledby="kartu-saya" className="flex flex-col gap-4 rounded-[18px] border border-line p-5">
              <div className="flex items-center gap-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-sm font-medium text-on-brand">
                  {initialsOf(user.fullName)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <h2 id="kartu-saya" className="truncate text-[15px] font-semibold">
                    {user.fullName}
                  </h2>
                  <span className="truncate text-[13px] text-ink-muted">
                    {[user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ') || 'Lengkapi profilmu'}
                  </span>
                </span>
              </div>
              {mine.length > 0 && (
                <p className="rounded-card bg-panel-nested px-3 py-2.5 text-[13px]">
                  Kamu anggota {mine.length} tim{scoped ? ' di kegiatan ini' : ''}.
                </p>
              )}
            </section>
          ) : (
            <section className="flex flex-col gap-3 rounded-[18px] border border-line p-5">
              <p className="text-sm leading-relaxed text-ink-soft">Masuk untuk membuka tim sendiri, melihat nama anggota, atau bergabung ke tim yang sudah ada.</p>
              <Link
                href={`/login?next=${encodeURIComponent(returnTo)}`}
                className="flex h-11 items-center justify-center rounded-card bg-brand text-sm font-semibold text-on-brand hover:bg-brand-hover"
              >
                Masuk
              </Link>
            </section>
          )}

          {user && demoFeaturesEnabled && <DemoTeamCard />}

          {/* <details> supaya halaman tetap terbaca sebagai daftar tim: yang
              datang ke sini umumnya mencari tim dulu, membuka tim baru lebih jarang. */}
          {user && openEvents && (
            <details className="group rounded-[18px] border border-dashed border-line-strong open:border-solid open:border-brand">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <Plus aria-hidden className="size-4 transition-transform duration-200 group-open:rotate-45" />
                Buka tim baru
              </summary>
              <form action={createTeamAction} className="flex flex-col gap-4 border-t border-line p-5">
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="eventId" className="text-[13.5px] font-semibold">
                    Kegiatan
                  </label>
                  <select id="eventId" name="eventId" required defaultValue={scoped?.id ?? ''} className={inputClass}>
                    <option value="" disabled>
                      Pilih kegiatan
                    </option>
                    {openEvents.items.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} — {EVENT_TYPE_LABEL[event.eventType]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="title" className="text-[13.5px] font-semibold">
                    Judul tim
                  </label>
                  <input id="title" name="title" required minLength={4} maxLength={255} aria-describedby="title-hint" className={inputClass} />
                  <p id="title-hint" className="text-[12.5px] text-ink-muted">
                    Contoh: Cari 2 anggota untuk tim hackathon.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="slotsNeeded" className="text-[13.5px] font-semibold">
                    Total anggota yang dibutuhkan
                  </label>
                  <input id="slotsNeeded" name="slotsNeeded" type="number" inputMode="numeric" min={1} max={50} defaultValue={4} required aria-describedby="slots-hint" className={inputClass} />
                  <p id="slots-hint" className="text-[12.5px] text-ink-muted">
                    Termasuk kamu sebagai ketua. Maksimal 50.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="description" className="text-[13.5px] font-semibold">
                    Keterangan
                  </label>
                  <textarea id="description" name="description" maxLength={1000} rows={4} aria-describedby="desc-hint" className={cn(inputClass, 'h-auto resize-y py-3')} />
                  <p id="desc-hint" className="text-[12.5px] text-ink-muted">
                    Sebutkan peran yang kamu cari dan cara kerja tim. Maksimal 1000 karakter.
                  </p>
                </div>
                <button type="submit" className="flex h-11 items-center justify-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                  Buka tim
                </button>
              </form>
            </details>
          )}
        </aside>

        <section aria-labelledby="daftar-tim" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="daftar-tim" className="text-[22px] font-bold tracking-[-0.025em]">
              Tim yang mencari anggota
            </h2>
            <span className="font-mono text-[13px] text-ink-muted">{teams.length}</span>
            <span aria-hidden className="h-px flex-1 self-center bg-line" />
            <span className="text-[13px] text-ink-muted">{openCount} masih butuh orang — tampil lebih dulu</span>
          </div>

          {teams.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-[18px] border border-dashed border-line-strong p-6">
              <p className="text-[15px] font-semibold">{scoped ? 'Belum ada tim untuk kegiatan ini.' : 'Belum ada tim yang dibuka.'}</p>
              <p className="text-sm text-ink-muted">Kamu bisa jadi yang pertama — buka tim dari panel di samping.</p>
            </div>
          ) : (
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
              {teams.map((team, index) => (
                <li key={team.id} className="enter [animation-duration:700ms]" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
                  <TeamCard team={team} currentUserId={user?.id ?? null} returnTo={returnTo} showEvent={!scoped} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
