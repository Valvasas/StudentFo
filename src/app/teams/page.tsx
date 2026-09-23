import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { createTeamAction } from '@/app/teams/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { TeamCard } from '@/components/team/team-card';
import { Button } from '@/components/ui/button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { parseEventQuery, type RawSearchParams } from '@/lib/search-params';
import { EVENT_TYPE_LABEL } from '@/types/domain';

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

export default async function TeamsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);

  const [teams, openEvents] = await Promise.all([
    repository.listTeams(),
    // Tim hanya masuk akal untuk kegiatan yang masih terbuka. Diurutkan dari
    // tenggat terdekat supaya pilihan teratas adalah yang paling mendesak.
    user
      ? repository.listEvents({ ...parseEventQuery({}), sort: 'deadline', pageSize: 48 })
      : Promise.resolve(null),
  ]);

  return (
    <div className="container-page py-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl">Cari rekan tim</h1>
        <p className="mt-3 text-ink-soft">
          Banyak lomba mensyaratkan tim, dan mencari anggota lewat grup chat berarti bersaing dengan
          ratusan pesan lain. Buka timmu di sini, sebutkan siapa yang kamu cari, lalu biarkan orang
          yang cocok menghubungi.
        </p>
      </header>

      <ActionFeedback params={params} className="mt-6 max-w-2xl" />

      {/* Formulir memakai <details> supaya halaman tetap terbaca sebagai
          daftar tim. Yang datang ke sini umumnya mencari tim dulu; membuka
          tim baru adalah tindakan yang lebih jarang. */}
      {user && openEvents ? (
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
              <TextArea id="description" name="description" maxLength={1000} />
            </Field>

            <Button type="submit" className="self-start">
              Buka tim
            </Button>
          </form>
        </details>
      ) : (
        <div className="mt-8 flex flex-col gap-3 rounded-card border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-soft">
            Masuk untuk membuka tim sendiri, melihat nama anggota, atau bergabung ke tim yang sudah ada.
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
