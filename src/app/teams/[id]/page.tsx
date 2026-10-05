import { cache, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Crown, LogIn, LogOut, Send, Trash2, UserMinus, UserRoundSearch } from 'lucide-react';
import { deleteTeamAction, joinTeamAction, leaveTeamAction, removeTeamMemberAction } from '@/app/teams/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { ShareButton } from '@/components/event/share-button';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { SeatMeter, TeamSeats, TeamSlotsBadge } from '@/components/team/team-card';
import { Avatar, TINT_BG } from '@/components/ui/avatar';
import { CelebrateSketch, Confetti } from '@/components/ui/feature-illustrations';
import { SparkleDoodle } from '@/components/ui/illustrations';
import { SubmitButton } from '@/components/ui/submit-button';
import { parseActionNoticeCode } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import { tintOf } from '@/lib/tint';
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

const primary =
  'flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover';
const secondary =
  'flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-line-strong/70 bg-panel text-[15px] font-semibold transition-colors duration-150 hover:bg-panel-nested';

export default async function TeamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [user, team] = await Promise.all([getSessionUser(), loadTeam(id)]);
  if (!team) notFound();

  const isLeader = user !== null && team.createdBy === user.id;
  const isMember = user !== null && team.members.some((member) => member.userId === user.id);
  const left = remainingSlots(team);
  const returnTo = `/teams/${team.id}`;
  const backHref = team.event ? `/teams?kegiatan=${team.event.slug}` : '/teams';
  // Perayaan menggantikan kalimat notice-nya; tanpa ini dua kabar yang sama tampil bertumpuk.
  const justCreated = isLeader && parseActionNoticeCode(query.notice) === 'team_created';
  const feedback = justCreated ? { ...query, notice: undefined } : query;

  return (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <Link href={backHref} className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Cari tim
      </Link>

      <ActionFeedback params={feedback} className="mb-6 max-w-2xl" />

      {justCreated && (
        <section
          aria-labelledby="tim-dibuka"
          className="enter relative mb-8 grid items-center gap-6 overflow-hidden rounded-[28px] border border-line bg-highlight-soft p-6 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-8"
        >
          <Confetti />
          <CelebrateSketch className="mx-auto max-w-[160px] sm:max-w-none" />
          <div className="flex flex-col gap-3">
            <span className="stamp w-fit rounded-[8px] border-2 border-current px-2.5 py-0.5 font-mono text-[12px] font-medium tracking-[.12em]" style={{ '--d': '300ms' } as CSSProperties}>
              DIBUKA
            </span>
            <h2 id="tim-dibuka" className="text-[clamp(24px,3.4vw,32px)] font-bold tracking-[-0.03em]">
              Timmu sudah tampil di Cari Tim!
            </h2>
            <p className="max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
              Kursi pertama paling cepat terisi lewat orang yang sudah kamu kenal. Bagikan tautannya, atau cari orang dengan minat yang cocok.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <ShareButton title={team.title} path={returnTo} label="Bagikan tautan tim" className="h-11 rounded-pill bg-brand px-5 font-semibold text-on-brand hover:bg-brand-hover" />
              <Link href="/connections" className="flex h-11 items-center gap-2 rounded-pill border border-line-strong/70 bg-panel px-5 text-sm font-semibold hover:bg-panel-nested">
                <UserRoundSearch aria-hidden className="size-4" /> Cari orang di Koneksi
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <article className="flex min-w-0 flex-col gap-8">
          <header className="enter overflow-hidden rounded-[28px] border border-line bg-panel [animation-duration:900ms]">
            <div className={`dot-grid relative px-6 pb-14 pt-6 sm:px-9 sm:pt-8 ${TINT_BG[tintOf(team.id)]}`}>
              <SparkleDoodle className="drift absolute right-[8%] top-[22%] hidden size-7 sm:block" />
              <div className="flex flex-wrap items-center gap-2">
                <TeamSlotsBadge team={team} />
                {isLeader && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-panel px-3 text-[12.5px] font-semibold">
                    <Crown aria-hidden className="size-3.5" /> Kamu ketua tim ini
                  </span>
                )}
                {team.event && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-panel px-3 text-[12.5px] font-semibold">
                    <EventTypeIcon type={team.event.eventType} /> {EVENT_TYPE_LABEL[team.event.eventType]}
                  </span>
                )}
              </div>
              <h1 className="mt-5 max-w-[20ch] text-[clamp(32px,5vw,52px)] leading-[1.02]">{team.title}</h1>
            </div>
            <div className="flex flex-col gap-5 px-6 pb-7 sm:px-9">
              <div className="relative z-10 -mt-7 flex flex-wrap items-end gap-x-6 gap-y-3">
                <TeamSeats team={team} size="lg" />
                <SeatMeter team={team} className="min-w-[220px] flex-1 pb-1" />
              </div>
              {team.description ? (
                <p className="max-w-[64ch] whitespace-pre-line text-[16px] leading-relaxed text-ink-soft">{team.description}</p>
              ) : (
                <p className="text-[15px] text-ink-muted">Ketua belum menulis keterangan tim.</p>
              )}
            </div>
          </header>

          <section aria-labelledby="anggota" className="enter flex flex-col gap-4 [animation-delay:100ms] [animation-duration:800ms]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="anggota" className="text-[22px] font-bold tracking-[-0.025em]">
                Anggota
              </h2>
              <p className="text-sm font-medium text-ink-muted">
                {team.memberCount} dari {team.slotsNeeded} orang
              </p>
            </div>
            {team.members.length === 0 && team.memberCount > 0 && (
              <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-sm text-ink-muted">Nama anggota hanya terlihat oleh pengguna yang sudah masuk.</p>
            )}

            <ul className="grid gap-3 sm:grid-cols-2">
              {team.members.map((member, index) => {
                const isSelf = user !== null && member.userId === user.id;
                return (
                  <li key={member.userId} className="rise flex flex-col gap-3 rounded-[20px] border border-line bg-panel p-4" style={{ '--i': index } as CSSProperties}>
                    <div className="flex items-center gap-3">
                      <Avatar name={member.fullName} seed={member.userId} size="lg" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15.5px] font-semibold">{member.fullName}</span>
                        <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted">
                          {member.role === 'leader' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-ink">
                              <Crown aria-hidden className="size-3" /> Ketua
                            </span>
                          ) : (
                            'Anggota'
                          )}
                          {isSelf && <span>· kamu</span>}
                          <span>· sejak {formatDateId(member.joinedAt)}</span>
                        </span>
                      </span>
                    </div>

                    {/* Ketua tidak pernah bisa dikeluarkan — termasuk oleh
                        dirinya sendiri. Tim tanpa ketua tidak bisa dikelola
                        siapa pun lagi. Mengeluarkan orang ada di balik satu
                        langkah konfirmasi (<details>, jalan tanpa JS). */}
                    {isLeader && member.role !== 'leader' && (
                      <details className="group -mb-1 border-t border-line pt-1">
                        <summary
                          aria-label={`Keluarkan ${member.fullName}`}
                          className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden"
                        >
                          <UserMinus aria-hidden className="size-4" /> Keluarkan
                        </summary>
                        <form action={removeTeamMemberAction} className="pop flex flex-col gap-2 pb-2 pt-1">
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="memberId" value={member.userId} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <p className="text-[12.5px] leading-snug text-ink-muted">Kursinya kembali kosong dan bisa diisi orang lain.</p>
                          {/* aria-label, bukan teks: nama di dalam lipatan tertutup ikut cocok saat orang mencari nama di halaman (pola block-person). */}
                          <SubmitButton
                            aria-label={`Ya, keluarkan ${member.fullName}`}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-pill border border-danger-line bg-danger-soft px-4 text-[13px] font-semibold text-danger"
                          >
                            Ya, keluarkan
                          </SubmitButton>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: Math.min(left, 6) }, (_, index) => (
                <li key={`kosong-${index}`} className="flex items-center gap-3 rounded-[20px] border-2 border-dashed border-line-strong/80 p-4">
                  <span aria-hidden className="breathe flex size-14 shrink-0 items-center justify-center rounded-pill border-2 border-dashed border-line-strong font-mono text-lg text-ink-muted">
                    +
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink-soft">Kursi kosong</span>
                    <span className="text-[12.5px] text-ink-muted">{user && !isMember ? 'Bisa jadi kamu.' : 'Menunggu orang yang cocok.'}</span>
                  </span>
                </li>
              ))}
            </ul>
            {left > 6 && <p className="text-[13px] text-ink-muted">dan {left - 6} kursi kosong lainnya.</p>}
          </section>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          <div className="flex flex-col gap-3 rounded-[24px] border border-line bg-panel p-5">
            {!user ? (
              <>
                <p className="text-sm leading-relaxed text-ink-soft">Masuk untuk bergabung dan melihat siapa saja anggotanya.</p>
                <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={primary}>
                  <LogIn aria-hidden className="size-4" /> Masuk
                </Link>
              </>
            ) : isLeader ? (
              <>
                <p className="text-sm leading-relaxed text-ink-soft">Kamu mengelola tim ini. Bagikan tautannya supaya kursi kosong cepat terisi.</p>
                <ShareButton title={team.title} path={returnTo} label="Bagikan tautan tim" className={secondary} />
                <details className="group border-t border-line pt-2">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-[13.5px] font-medium text-danger hover:underline [&::-webkit-details-marker]:hidden">
                    <Trash2 aria-hidden className="size-4" /> Bubarkan tim
                  </summary>
                  <form action={deleteTeamAction} className="pop flex flex-col gap-3 pt-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="returnTo" value="/teams" />
                    <p className="text-[13px] leading-relaxed text-ink-soft">Seluruh daftar anggotanya ikut terhapus. Tindakan ini tidak bisa dibatalkan.</p>
                    <SubmitButton className="flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-danger-line bg-danger-soft text-[15px] font-semibold text-danger">
                      Ya, bubarkan tim
                    </SubmitButton>
                  </form>
                </details>
              </>
            ) : isMember ? (
              <form action={leaveTeamAction} className="flex flex-col gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="text-sm leading-relaxed text-ink-soft">Kamu sudah tergabung di tim ini.</p>
                <SubmitButton className={secondary}>
                  <LogOut aria-hidden className="size-4" />
                  Keluar dari tim
                </SubmitButton>
              </form>
            ) : left === 0 ? (
              <p className="text-sm leading-relaxed text-ink-muted">Tim ini sudah penuh. Coba tim lain, atau buka timmu sendiri.</p>
            ) : (
              <form action={joinTeamAction} className="flex flex-col gap-3">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="text-sm leading-relaxed text-ink-soft">
                  Masih ada <strong className="font-semibold text-ink">{left} kursi</strong>. Setelah bergabung, namamu terlihat oleh anggota lain.
                </p>
                <SubmitButton className={primary}>
                  <Send aria-hidden className="size-4" />
                  Ajukan gabung
                </SubmitButton>
              </form>
            )}
          </div>

          {team.event ? (
            <div className="flex flex-col gap-3 rounded-[24px] bg-inverse p-5 text-on-inverse">
              <span className="font-mono text-[11.5px] tracking-[.08em] text-on-inverse-muted">UNTUK KEGIATAN</span>
              {/* text-on-inverse eksplisit: h2 mewarisi tinta gelap dari lapisan dasar, tak terbaca di panel gelap. */}
              <h2 className="text-[18px] font-semibold leading-snug text-on-inverse">
                <Link href={`/events/${team.event.slug}`} className="-my-1 inline-flex min-h-11 items-center hover:underline">
                  {team.event.title}
                </Link>
              </h2>
              <p className="-mt-2 text-sm text-on-inverse-muted">
                {team.event.organizer} · {EVENT_TYPE_LABEL[team.event.eventType]}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {team.event.primaryDeadlineAt ? `Pendaftaran tutup ${formatDateId(team.event.primaryDeadlineAt)}` : 'Tenggat belum diumumkan'}
                <DeadlineTag deadlineAt={team.event.primaryDeadlineAt} className="rounded-[999px] bg-on-inverse px-2.5 text-inverse" />
              </div>
              <Link href={`/events/${team.event.slug}`} className="mt-1 flex h-11 items-center justify-center gap-1.5 rounded-pill bg-on-inverse text-sm font-semibold text-inverse hover:opacity-90">
                Lihat kegiatan <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="rounded-[24px] border border-line p-5 text-sm text-ink-muted">Kegiatan untuk tim ini sudah tidak tayang.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
