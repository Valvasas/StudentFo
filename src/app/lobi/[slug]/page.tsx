import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowUpRight, Check, Clock, DoorOpen, Lock, LogOut, Send, UserPlus, Users } from 'lucide-react';
import { requestConnectionAction } from '@/app/connections/actions';
import { updateTrackerStatusAction } from '@/app/tracker/actions';
import { ShareButton } from '@/components/event/share-button';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { PublicBadges } from '@/components/profile/public-badges';
import { TeamCard } from '@/components/team/team-card';
import { Avatar } from '@/components/ui/avatar';
import { BackLink } from '@/components/ui/back-link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Field, TextInput } from '@/components/ui/field';
import { ChoiceGroup } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import { evaluateBadges, type AchievementFacts, type BadgeProgress } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil } from '@/lib/deadline';
import { withFallback } from '@/lib/fallback';
import { LOBBY_LIMITS } from '@/lib/lobby';
import { sectionTitle } from '@/lib/page-title';
import type { RawSearchParams } from '@/lib/search-params';
import { LOBBY_INTENT_LABEL, LOBBY_INTENTS, type LobbyMember, type LobbyView } from '@/types/domain';
import { inviteToLobbyAction, joinLobbyAction, leaveLobbyAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await (await getEventRepository()).getEventBySlug((await params).slug);
  return {
    title: event ? sectionTitle('Lobi', event.title) : 'Lobi lomba',
    robots: { index: false, follow: false },
  };
}

const INTENT_HINT: Record<LobbyMember['intent'], string> = {
  CARI_TIM: 'Belum punya tim, ingin bergabung ke tim orang lain.',
  CARI_ANGGOTA: 'Sudah punya tim, masih butuh anggota.',
  SIAP: 'Tim sudah lengkap — sekadar menyapa sesama peserta.',
};

function Panel({ id, title, icon, hint, children }: { id: string; title: string; icon: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-[9px] bg-panel-nested text-ink-muted">
            {icon}
          </span>
          {title}
        </h2>
        {hint && <p className="text-[13.5px] leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function LobbyCardForm({ lobby, slug }: { lobby: LobbyView; slug: string }) {
  const me = lobby.me;
  return (
    <form action={joinLobbyAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <ChoiceGroup legend="Statusmu di lobi">
        <div className="flex flex-col gap-2">
          {LOBBY_INTENTS.map((intent) => (
            <label key={intent} className="choice items-start">
              <input type="radio" name="intent" value={intent} required defaultChecked={me?.intent === intent} className="check mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{LOBBY_INTENT_LABEL[intent]}</span>
                <span className="text-[12.5px] font-normal text-ink-muted">{INTENT_HINT[intent]}</span>
              </span>
            </label>
          ))}
        </div>
      </ChoiceGroup>
      <Field id="note" label="Catatan singkat (opsional)" hint={`Keahlian yang kamu bawa atau cari. Maks. ${LOBBY_LIMITS.noteMax} karakter.`}>
        <TextInput id="note" name="note" maxLength={LOBBY_LIMITS.noteMax} defaultValue={me?.note ?? ''} placeholder="Mis. Bisa UI/UX & presentasi, cari backend" />
      </Field>
      <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ className: 'self-start' })}>
        {me ? 'Simpan kartu lobi' : 'Masuk lobi'}
      </SubmitButton>
    </form>
  );
}

function MemberRow({ member, slug, eventTitle, badges }: { member: LobbyMember; slug: string; eventTitle: string; badges: readonly BadgeProgress[] | null }) {
  return (
    <li className="flex flex-col gap-3 rounded-[14px] border border-line p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Avatar name={member.fullName} seed={member.userId} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="break-words font-semibold">{member.fullName}</span>
          <Badge variant={member.intent === 'SIAP' ? 'neutral' : 'brand'} className="self-start">
            {LOBBY_INTENT_LABEL[member.intent]}
          </Badge>
          {member.note && <p className="break-words text-[13.5px] leading-relaxed text-ink-soft">{member.note}</p>}
          {badges && <PublicBadges progress={badges} limit={2} compact className="mt-1" />}
        </div>
      </div>
      <div className="shrink-0">
        {member.relation === 'connected' ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-ink-soft">
            <Check aria-hidden className="size-4 text-success" /> Terhubung
          </span>
        ) : member.relation === 'pending' ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-ink-muted">
            <Clock aria-hidden className="size-4" /> Ajakan menunggu
          </span>
        ) : (
          <form action={requestConnectionAction}>
            <input type="hidden" name="targetId" value={member.userId} />
            <input type="hidden" name="returnTo" value={`/lobi/${slug}`} />
            <input type="hidden" name="message" value={`Halo! Aku juga di lobi ${eventTitle}`.slice(0, 280)} />
            <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <UserPlus aria-hidden /> Ajak terhubung
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * Lobi satu lomba (ADR-071). Urutannya mengikuti tugas orang yang baru
 * mendaftar: (1) pasang kartu "aku mencari tim/anggota", (2) lihat siapa
 * saja yang juga mencari, (3) tim yang sudah dibuka untuk lomba ini, (4) ajak
 * teman. Daftar anggota baru terlihat setelah bergabung — timbal-balik,
 * sama seperti kartu pemain.
 */
export default async function LobbyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const self = `/lobi/${slug}`;
  const user = await requireUser(self);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event || event.eventType !== 'LOMBA') notFound();

  const [lobby, teams] = await Promise.all([
    repository.getLobby(user, event.id),
    withFallback('tim lomba', () => repository.listTeams(event.id), []),
  ]);
  const now = new Date();
  const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
  // Lencana anggota yang memilih menampilkannya (ADR-072) — sinyal saat memilih rekan tim.
  const badgeFacts = lobby?.members.length
    ? await withFallback('lencana anggota lobi', () => repository.listPublicBadgeFacts(user.id, lobby.members.map((member) => member.userId)), new Map())
    : new Map<string, AchievementFacts>();
  const badgesOf = (userId: string) => {
    const facts = badgeFacts.get(userId);
    return facts ? evaluateBadges(facts, now) : null;
  };

  return (
    <AccountShell user={user} active="lobi">
      <div className="flex max-w-[860px] flex-col gap-6">
        <BackLink href="/lobi" label="Lobi lomba" className="-mb-3" />
        <header className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-muted">
            <DoorOpen aria-hidden className="size-4" /> Lobi lomba
          </p>
          <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">{event.title}</h1>
          <p className="text-[15px] text-ink-soft">{event.organizer}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-ink-soft">
            <li className="inline-flex items-center gap-1.5">
              {lobby?.open ? <Clock aria-hidden className="size-4 text-ink-muted" /> : <Lock aria-hidden className="size-4 text-ink-muted" />}
              {lobby && !lobby.open ? 'Pendaftaran ditutup — lobi hanya bisa dibaca' : `Pendaftaran ${daysLeftLabel(days).toLowerCase()}`}
            </li>
            {lobby && (
              <li className="inline-flex items-center gap-1.5">
                <Users aria-hidden className="size-4 text-ink-muted" />
                {lobby.memberCount.toLocaleString('id-ID')} peserta di lobi
              </li>
            )}
            <li>
              <Link href={`/events/${event.slug}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-ink underline-offset-[3px] hover:underline">
                Halaman lomba <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </li>
          </ul>
        </header>

        <ActionFeedback params={query} />

        {!lobby ? (
          <Panel id="belum-terdaftar" title="Lobi ini untuk peserta yang sudah mendaftar" icon={<Lock className="size-4" />}>
            <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-ink-soft">
              Daftar dulu lewat halaman lombanya. Sudah mendaftar di situs resmi penyelenggara? Catat di sini — lobinya langsung terbuka.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={updateTrackerStatusAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="status" value="APPLIED" />
                <input type="hidden" name="returnTo" value={self} />
                <SubmitButton pendingLabel="Mencatat…" className={buttonVariants({ size: 'sm' })}>
                  <Check aria-hidden /> Sudah daftar, buka lobinya
                </SubmitButton>
              </form>
              <Link href={`/events/${event.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Lihat lomba
              </Link>
            </div>
          </Panel>
        ) : (
          <>
            {lobby.open ? (
              <Panel
                id="kartu-lobi"
                title={lobby.me ? 'Kartumu di lobi' : 'Masuk lobi'}
                icon={<DoorOpen className="size-4" />}
                hint="Peserta lain yang SUDAH masuk lobi ini melihat namamu, status, dan catatanmu — bukan email. Kamu bisa keluar kapan saja."
              >
                <LobbyCardForm lobby={lobby} slug={event.slug} />
                {lobby.me && (
                  <form action={leaveLobbyAction} className="border-t border-line pt-4">
                    <input type="hidden" name="slug" value={event.slug} />
                    <ConfirmSubmit
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      confirm={{
                        title: 'Keluar dari lobi?',
                        description: 'Kartumu tidak lagi terlihat peserta lain, dan kamu tidak lagi melihat daftar anggota lobi ini. Koneksi yang sudah terjalin tetap ada.',
                        confirmLabel: 'Ya, keluar',
                        icon: <LogOut />,
                      }}
                    >
                      <LogOut aria-hidden /> Keluar lobi
                    </ConfirmSubmit>
                  </form>
                )}
              </Panel>
            ) : (
              <p role="note" className="flex items-start gap-2 rounded-card bg-panel-nested p-4 text-[14px] text-ink-soft">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                Pendaftaran lomba ini sudah ditutup, jadi lobi tidak menerima anggota atau ajakan baru.
              </p>
            )}

            <Panel
              id="anggota"
              title="Peserta di lobi"
              icon={<Users className="size-4" />}
              hint={lobby.me ? 'Yang paling cocok denganmu tampil lebih dulu.' : undefined}
            >
              {!lobby.me ? (
                <p className="text-[14px] text-ink-soft">
                  {lobby.memberCount > 0
                    ? `${lobby.memberCount.toLocaleString('id-ID')} peserta sudah di lobi. Masuk lobi untuk melihat siapa saja — mereka juga akan melihatmu.`
                    : 'Belum ada peserta di lobi. Jadi yang pertama, lalu ajak temanmu.'}
                </p>
              ) : lobby.members.length === 0 ? (
                <p className="text-[14px] text-ink-soft">Belum ada peserta lain di lobi. Ajak temanmu di bawah, atau buka tim untuk lomba ini.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {lobby.members.map((member) => (
                    <MemberRow key={member.userId} member={member} slug={event.slug} eventTitle={event.title} badges={badgesOf(member.userId)} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="tim-lomba" title="Tim untuk lomba ini" icon={<Users className="size-4" />} hint="Tim yang dibuka di Cari Tim untuk lomba ini.">
              {teams.length === 0 ? (
                <p className="text-[14px] text-ink-soft">Belum ada tim yang dibuka untuk lomba ini.</p>
              ) : (
                <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                  {teams.map((team) => (
                    <li key={team.id}>
                      <TeamCard team={team} currentUserId={user.id} returnTo={self} showEvent={false} />
                    </li>
                  ))}
                </ul>
              )}
              {lobby.open && (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/teams/baru?kegiatan=${encodeURIComponent(event.slug)}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Buka tim untuk lomba ini
                  </Link>
                  <Link href="/teams/cocok" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Cocokkan partner otomatis
                  </Link>
                </div>
              )}
            </Panel>

            <Panel
              id="ajak-teman"
              title="Ajak teman ikut lomba ini"
              icon={<Send className="size-4" />}
              hint="Koneksimu mendapat notifikasi berisi tautan lomba ini. Satu orang hanya dikabari sekali per lomba, walau diajak beberapa teman."
            >
              {lobby.open && lobby.invitable.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {lobby.invitable.map((peer) => (
                    <li key={peer.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-3.5 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={peer.fullName} seed={peer.userId} size="sm" />
                        <span className="break-words text-[14.5px] font-medium">{peer.fullName}</span>
                      </span>
                      <form action={inviteToLobbyAction}>
                        <input type="hidden" name="slug" value={event.slug} />
                        <input type="hidden" name="inviteeId" value={peer.userId} />
                        <SubmitButton pendingLabel="Mengajak…" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                          <Send aria-hidden /> Ajak
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {lobby.invited.length > 0 && (
                <p className="text-[13.5px] text-ink-muted">
                  Sudah kamu ajak: {lobby.invited.map((peer) => peer.fullName).join(', ')}.
                </p>
              )}
              {lobby.open && lobby.invitable.length === 0 && lobby.invited.length === 0 && (
                <p className="text-[14px] text-ink-soft">
                  Belum ada koneksi yang bisa diajak.{' '}
                  <Link href="/connections" className="font-medium text-ink underline underline-offset-[3px]">
                    Cari koneksi
                  </Link>{' '}
                  atau bagikan tautan lombanya.
                </p>
              )}
              <ShareButton title={event.title} path={`/events/${event.slug}`} label="Bagikan tautan lomba" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })} />
            </Panel>
          </>
        )}
      </div>
    </AccountShell>
  );
}
