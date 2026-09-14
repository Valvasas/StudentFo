import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, PlusCircle, UserPlus, Users } from 'lucide-react';
import { createTeamAction, joinTeamAction } from '@/app/teams/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectInput, TextInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { parseEventQuery } from '@/lib/search-params';
import type { RawSearchParams } from '@/lib/search-params';
import { EVENT_TYPE_LABEL, remainingSlots, type Team } from '@/types/domain';

/**
 * Halaman "cari rekan tim" — Phase 3.
 *
 * Dirender dinamis karena kartunya menampilkan sisa tenggat kegiatan, dan
 * daftar anggotanya berubah begitu ada yang bergabung.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cari rekan tim',
  description:
    'Temukan rekan satu tim untuk lomba, hackathon, dan karya tulis — atau buka timmu sendiri dan tunggu yang tertarik bergabung.',
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const errorMessage = typeof params.error === 'string' ? params.error.slice(0, 200) : null;

  const user = await getSessionUser();
  const repository = await getEventRepository();

  const [teams, openEvents] = await Promise.all([
    repository.listTeams(),
    // Tim hanya masuk akal untuk kegiatan yang masih terbuka. Diurutkan dari
    // tenggat terdekat supaya pilihan teratas adalah yang paling mendesak.
    repository.listEvents({ ...parseEventQuery({}), sort: 'deadline', pageSize: 40 }),
  ]);

  return (
    <div className="container-page py-10">
      <header className="max-w-2xl">
        <Badge variant="brand" className="mb-3">
          <Users aria-hidden className="size-3" />
          Phase 3
        </Badge>
        <h1 className="text-3xl">Cari rekan tim</h1>
        <p className="mt-3 text-ink-soft">
          Banyak lomba mensyaratkan tim, dan mencari anggota lewat grup chat berarti bersaing dengan
          ratusan pesan lain. Buka timmu di sini, sebutkan siapa yang kamu cari, lalu biarkan orang
          yang cocok menghubungi.
        </p>
      </header>

      {errorMessage && (
        <div className="mt-6 max-w-2xl">
          <FormAlert tone="error">{errorMessage}</FormAlert>
        </div>
      )}

      {/* Formulir memakai <details> supaya halaman tetap terbaca sebagai
          daftar tim. Yang datang ke sini umumnya mencari tim dulu; membuka
          tim baru adalah tindakan yang lebih jarang. */}
      {user ? (
        <details className="mt-8 rounded-card border border-line bg-panel">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-sm font-medium">
            <PlusCircle aria-hidden className="size-4 text-brand" />
            Buka tim baru
          </summary>

          <form action={createTeamAction} className="flex flex-col gap-4 border-t border-line p-5">
            <input type="hidden" name="returnTo" value="/teams" />

            <Field id="eventId" label="Kegiatan">
              <SelectInput id="eventId" name="eventId" required defaultValue="">
                <option value="" disabled>
                  Pilih kegiatan
                </option>
                {openEvents.items.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} — {EVENT_TYPE_LABEL[event.eventType]}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field id="title" label="Judul tim" hint="Contoh: Cari 2 anggota untuk tim hackathon.">
              <TextInput id="title" name="title" required minLength={4} maxLength={255} />
            </Field>

            <Field
              id="slotsNeeded"
              label="Total anggota yang dibutuhkan"
              hint="Termasuk kamu sebagai ketua. Maksimal 50."
            >
              <TextInput
                id="slotsNeeded"
                name="slotsNeeded"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                defaultValue={4}
                required
              />
            </Field>

            <Field
              id="description"
              label="Keterangan"
              hint="Sebutkan keahlian yang kamu cari dan cara kerja tim. Maksimal 1000 karakter."
            >
              <textarea
                id="description"
                name="description"
                rows={4}
                maxLength={1000}
                className="w-full rounded-card border border-line bg-panel p-3 text-base text-ink transition-colors duration-150 ease-snap placeholder:text-ink-faint hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
            </Field>

            <Button type="submit" className="self-start">
              Buka tim
            </Button>
          </form>
        </details>
      ) : (
        <div className="mt-8 flex flex-col gap-3 rounded-card border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-soft">
            Masuk untuk membuka tim sendiri atau bergabung ke tim yang sudah ada.
          </p>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/login?next=%2Fteams">Masuk</Link>
          </Button>
        </div>
      )}

      <section aria-labelledby="daftar-tim" className="mt-10">
        <h2 id="daftar-tim" className="text-2xl">
          Tim yang sedang mencari anggota
        </h2>

        {teams.length === 0 ? (
          <p className="mt-4 rounded-card border border-line bg-panel p-5 text-sm text-ink-muted">
            Belum ada tim yang dibuka. Kamu bisa jadi yang pertama.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {teams.map((team) => (
              <li key={team.id}>
                <TeamCard team={team} currentUserId={user?.id ?? null} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TeamCard({ team, currentUserId }: { team: Team; currentUserId: string | null }) {
  const left = remainingSlots(team);
  const isMember = currentUserId !== null && team.members.some((m) => m.userId === currentUserId);
  const isFull = left === 0;

  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">
          <Link href={`/teams/${team.id}`} className="hover:text-brand-text">
            {team.title}
          </Link>
        </h3>
        {isFull ? (
          <Badge variant="neutral">Tim penuh</Badge>
        ) : (
          <Badge variant="brand">{left} slot tersisa</Badge>
        )}
      </div>

      {team.event ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span className="font-medium text-ink-soft">{team.event.title}</span>
          <span aria-hidden>·</span>
          <span>{EVENT_TYPE_LABEL[team.event.eventType]}</span>
          {team.event.primaryDeadlineAt && (
            <span className="flex items-center gap-1">
              <CalendarClock aria-hidden className="size-3.5" />
              {formatDateId(team.event.primaryDeadlineAt)}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Kegiatan sudah tidak tayang.</p>
      )}

      {team.description && (
        <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{team.description}</p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
        <Users aria-hidden className="size-4" />
        {team.members.length} dari {team.slotsNeeded} anggota
      </p>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        {isMember ? (
          <Badge variant="success">Kamu anggota tim ini</Badge>
        ) : currentUserId && !isFull ? (
          <form action={joinTeamAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value="/teams" />
            <Button type="submit" size="sm" variant="secondary">
              <UserPlus aria-hidden />
              Ajukan gabung
            </Button>
          </form>
        ) : null}

        <Link
          href={`/teams/${team.id}`}
          className="ml-auto text-sm font-medium text-brand-text hover:underline"
        >
          Lihat tim
        </Link>
      </div>
    </article>
  );
}
