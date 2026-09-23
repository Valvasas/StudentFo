import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Crown, LogOut, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import {
  deleteTeamAction,
  joinTeamAction,
  leaveTeamAction,
  removeTeamMemberAction,
} from '@/app/teams/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { TeamSlotsBadge } from '@/components/team/team-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { RawSearchParams } from '@/lib/search-params';
import { EVENT_TYPE_LABEL, remainingSlots } from '@/types/domain';

export const dynamic = 'force-dynamic';

/** Dipanggil oleh generateMetadata DAN halaman; cache() membuatnya satu query per request. */
const loadTeam = cache(async (id: string) => (await getEventRepository()).getTeamById(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await loadTeam(id);

  if (!team) return { title: 'Tim tidak ditemukan' };
  return {
    title: team.title,
    description: team.description ?? `Tim untuk ${team.event?.title ?? 'kegiatan'}.`,
    // Halaman tim memuat nama orang. Itu tidak perlu ada di hasil pencarian
    // mesin telusur — cukup terlihat oleh sesama pengguna yang masuk.
    robots: { index: false, follow: true },
  };
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [user, team] = await Promise.all([getSessionUser(), loadTeam(id)]);
  if (!team) notFound();

  const isLeader = user !== null && team.createdBy === user.id;
  const isMember = user !== null && team.members.some((member) => member.userId === user.id);
  const left = remainingSlots(team);
  const returnTo = `/teams/${team.id}`;

  return (
    <div className="container-page py-8">
      <nav aria-label="Remah roti" className="mb-6 text-sm text-ink-muted">
        <Link href="/teams" className="hover:text-ink">
          Cari rekan tim
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-ink-soft">{team.title}</span>
      </nav>

      <ActionFeedback params={query} className="mb-6 max-w-2xl" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <TeamSlotsBadge team={team} />
            {isLeader && (
              <Badge variant="outline">
                <Crown aria-hidden className="size-3" />
                Kamu ketua tim ini
              </Badge>
            )}
          </div>

          <h1 className="mt-3 text-3xl">{team.title}</h1>

          {team.description && (
            <p className="mt-4 whitespace-pre-line text-ink-soft">{team.description}</p>
          )}

          <section aria-labelledby="anggota" className="mt-8">
            <h2 id="anggota" className="text-xl">
              Anggota
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {team.memberCount} dari {team.slotsNeeded} orang
            </p>
            {team.members.length === 0 && team.memberCount > 0 && (
              <p className="mt-3 rounded-card border border-dashed border-line p-4 text-sm text-ink-muted">
                Nama anggota hanya terlihat oleh pengguna yang sudah masuk.
              </p>
            )}

            <ul className="mt-3 flex flex-col gap-2">
              {team.members.map((member) => {
                const isSelf = user !== null && member.userId === user.id;
                return (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel p-4"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-xs font-semibold text-brand-text"
                      >
                        {member.fullName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium">{member.fullName}</span>
                      {member.role === 'leader' && <Badge variant="outline">Ketua</Badge>}
                      {isSelf && <Badge variant="success">Kamu</Badge>}
                    </span>

                    {/* Ketua tidak pernah bisa dikeluarkan — termasuk oleh
                        dirinya sendiri. Tim tanpa ketua tidak bisa dikelola
                        siapa pun lagi. */}
                    {isLeader && member.role !== 'leader' && (
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="memberId" value={member.userId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Button type="submit" size="sm" variant="ghost">
                          <UserMinus aria-hidden />
                          Keluarkan
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {team.event ? (
            <div className="rounded-card border border-line bg-panel p-5 shadow-card">
              <p className="text-xs uppercase tracking-wide text-ink-faint">Untuk kegiatan</p>
              <h2 className="mt-1 text-base font-semibold leading-snug">
                <Link href={`/events/${team.event.slug}`} className="hover:text-brand-text">
                  {team.event.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{team.event.organizer}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="brand">{EVENT_TYPE_LABEL[team.event.eventType]}</Badge>
                <DeadlineTag deadlineAt={team.event.primaryDeadlineAt} />
              </div>

              <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
                <Link href={`/events/${team.event.slug}`}>
                  Lihat kegiatan <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-panel p-5 text-sm text-ink-muted">
              Kegiatan untuk tim ini sudah tidak tayang.
            </div>
          )}

          <div className="rounded-card border border-line bg-panel p-5">
            {!user ? (
              <>
                <p className="text-sm text-ink-soft">Masuk untuk bergabung ke tim ini.</p>
                <Button asChild size="sm" className="mt-3 w-full">
                  <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>Masuk</Link>
                </Button>
              </>
            ) : isLeader ? (
              <form action={deleteTeamAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value="/teams" />
                <p className="text-sm text-ink-soft">
                  Membubarkan tim menghapus seluruh daftar anggotanya. Tindakan ini tidak bisa
                  dibatalkan.
                </p>
                <Button type="submit" size="sm" variant="danger" className="mt-3 w-full">
                  <Trash2 aria-hidden />
                  Bubarkan tim
                </Button>
              </form>
            ) : isMember ? (
              <form action={leaveTeamAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <Users aria-hidden className="size-4" />
                  Kamu sudah tergabung di tim ini.
                </p>
                <Button type="submit" size="sm" variant="secondary" className="mt-3 w-full">
                  <LogOut aria-hidden />
                  Keluar dari tim
                </Button>
              </form>
            ) : left === 0 ? (
              <p className="text-sm text-ink-muted">
                Tim ini sudah penuh. Coba tim lain, atau buka timmu sendiri.
              </p>
            ) : (
              <form action={joinTeamAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button type="submit" size="sm" className="w-full">
                  <UserPlus aria-hidden />
                  Ajukan gabung
                </Button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
