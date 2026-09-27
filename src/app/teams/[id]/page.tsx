import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Crown, LogOut, Send, Trash2, UserMinus } from 'lucide-react';
import { deleteTeamAction, joinTeamAction, leaveTeamAction, removeTeamMemberAction } from '@/app/teams/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { TeamSeats, TeamSlotsBadge } from '@/components/team/team-card';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { initialsOf } from '@/lib/initials';
import type { RawSearchParams } from '@/lib/search-params';
import { EVENT_TYPE_LABEL, remainingSlots } from '@/types/domain';

export const dynamic = 'force-dynamic';

/** Dipanggil oleh generateMetadata DAN halaman; cache() membuatnya satu query per request. */
const loadTeam = cache(async (id: string) => (await getEventRepository()).getTeamById(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
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

const primary = 'flex h-12 w-full items-center justify-center gap-2 rounded-card bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover';
const secondary = 'flex h-12 w-full items-center justify-center gap-2 rounded-card border border-line-strong/70 text-[15px] font-semibold transition-colors duration-150 hover:bg-panel-nested';

export default async function TeamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [user, team] = await Promise.all([getSessionUser(), loadTeam(id)]);
  if (!team) notFound();

  const isLeader = user !== null && team.createdBy === user.id;
  const isMember = user !== null && team.members.some((member) => member.userId === user.id);
  const left = remainingSlots(team);
  const returnTo = `/teams/${team.id}`;
  const backHref = team.event ? `/teams?kegiatan=${team.event.slug}` : '/teams';

  return (
    <div className="container-page pb-16 pt-6">
      <Link href={backHref} className="mb-4 flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Cari tim
      </Link>

      <ActionFeedback params={query} className="mb-6 max-w-2xl" />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="flex min-w-0 flex-col gap-8">
          <header className="enter flex flex-col gap-4 [animation-duration:900ms]">
            <div className="flex flex-wrap items-center gap-2">
              <TeamSlotsBadge team={team} />
              {isLeader && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-brand px-2.5 text-[12.5px] font-semibold">
                  <Crown aria-hidden className="size-3" /> Kamu ketua tim ini
                </span>
              )}
            </div>
            <h1 className="max-w-[22ch] text-[clamp(32px,5vw,48px)] leading-[1.04]">{team.title}</h1>
            <TeamSeats team={team} size="lg" />
            {team.description && <p className="max-w-[62ch] whitespace-pre-line text-[15.5px] leading-relaxed text-ink-soft">{team.description}</p>}
          </header>

          <section aria-labelledby="anggota" className="enter flex flex-col gap-3 rounded-[18px] border border-line p-5 [animation-delay:100ms] [animation-duration:800ms] sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="anggota" className="text-lg font-semibold">
                Anggota
              </h2>
              <p className="text-sm text-ink-muted">
                {team.memberCount} dari {team.slotsNeeded} orang
              </p>
            </div>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-[3px] bg-line">
              <div className="h-full rounded-[3px] bg-brand transition-[width] duration-700 ease-enter" style={{ width: `${Math.min(100, (team.memberCount / team.slotsNeeded) * 100)}%` }} />
            </div>
            {team.members.length === 0 && team.memberCount > 0 && (
              <p className="rounded-card border border-dashed border-line-strong p-4 text-sm text-ink-muted">Nama anggota hanya terlihat oleh pengguna yang sudah masuk.</p>
            )}

            <ul className="flex flex-col">
              {team.members.map((member) => {
                const isSelf = user !== null && member.userId === user.id;
                return (
                  <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 py-3 first:border-t-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[13px] font-medium text-on-brand">
                        {initialsOf(member.fullName)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[15px] font-semibold">{member.fullName}</span>
                        <span className="text-[12.5px] text-ink-muted">
                          {member.role === 'leader' ? 'Ketua' : 'Anggota'}
                          {isSelf && ' · kamu'} · bergabung {formatDateId(member.joinedAt)}
                        </span>
                      </span>
                    </span>

                    {/* Ketua tidak pernah bisa dikeluarkan — termasuk oleh
                        dirinya sendiri. Tim tanpa ketua tidak bisa dikelola
                        siapa pun lagi. */}
                    {isLeader && member.role !== 'leader' && (
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="memberId" value={member.userId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          aria-label={`Keluarkan ${member.fullName}`}
                          className="flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
                        >
                          <UserMinus aria-hidden className="size-4" />
                          Keluarkan
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: Math.min(left, 6) }, (_, index) => (
                <li key={`kosong-${index}`} className="flex items-center gap-3 border-t border-line/70 py-3 first:border-t-0">
                  <span aria-hidden className="size-10 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
                  <span className="text-sm text-ink-muted">Kursi kosong</span>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          {team.event ? (
            <div className="flex flex-col gap-3 rounded-[18px] bg-inverse p-5 text-on-inverse">
              <span className="font-mono text-[11.5px] tracking-[.08em] text-on-inverse-muted">UNTUK KEGIATAN</span>
              <h2 className="text-[17px] font-semibold leading-snug">
                <Link href={`/events/${team.event.slug}`} className="-my-1 inline-flex min-h-11 items-center hover:underline">
                  {team.event.title}
                </Link>
              </h2>
              <p className="-mt-2 text-sm text-on-inverse-muted">
                {team.event.organizer} · {EVENT_TYPE_LABEL[team.event.eventType]}
              </p>
              <p className="text-sm">
                {team.event.primaryDeadlineAt ? `Pendaftaran tutup ${formatDateId(team.event.primaryDeadlineAt)}` : 'Tenggat belum diumumkan'}
              </p>
              <Link href={`/events/${team.event.slug}`} className="mt-1 flex h-11 items-center justify-center gap-1.5 rounded-card bg-on-inverse text-sm font-semibold text-inverse hover:opacity-90">
                Lihat kegiatan <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="rounded-[18px] border border-line p-5 text-sm text-ink-muted">Kegiatan untuk tim ini sudah tidak tayang.</div>
          )}

          <div className="flex flex-col gap-3 rounded-[18px] border border-line p-5">
            {!user ? (
              <>
                <p className="text-sm text-ink-soft">Masuk untuk bergabung ke tim ini.</p>
                <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={primary}>
                  Masuk
                </Link>
              </>
            ) : isLeader ? (
              <form action={deleteTeamAction} className="flex flex-col gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value="/teams" />
                <p className="text-sm text-ink-soft">Membubarkan tim menghapus seluruh daftar anggotanya. Tindakan ini tidak bisa dibatalkan.</p>
                <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-card border border-danger-line text-[15px] font-semibold text-danger hover:bg-danger-soft">
                  <Trash2 aria-hidden className="size-4" />
                  Bubarkan tim
                </button>
              </form>
            ) : isMember ? (
              <form action={leaveTeamAction} className="flex flex-col gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="text-sm text-ink-soft">Kamu sudah tergabung di tim ini.</p>
                <button type="submit" className={secondary}>
                  <LogOut aria-hidden className="size-4" />
                  Keluar dari tim
                </button>
              </form>
            ) : left === 0 ? (
              <p className="text-sm text-ink-muted">Tim ini sudah penuh. Coba tim lain, atau buka timmu sendiri.</p>
            ) : (
              <form action={joinTeamAction} className="flex flex-col gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="text-sm text-ink-soft">Masih ada {left} kursi. Setelah bergabung, namamu terlihat oleh anggota lain.</p>
                <button type="submit" className={primary}>
                  <Send aria-hidden className="size-4" />
                  Ajukan gabung
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
