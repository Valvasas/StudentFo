import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarClock, DoorOpen, Lock, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil } from '@/lib/deadline';
import { isLobbyOpen } from '@/lib/lobby';
import type { RawSearchParams } from '@/lib/search-params';
import { LOBBY_INTENT_LABEL, type LobbySummary } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lobi lomba',
  robots: { index: false, follow: false },
};

function LobbyRow({ lobby, now }: { lobby: LobbySummary; now: Date }) {
  const open = isLobbyOpen(lobby.event, now);
  return (
    <li className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={`/lobi/${lobby.event.slug}`}
          className="relative text-[16.5px] font-semibold leading-snug underline-offset-[3px] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:underline"
        >
          {lobby.event.title}
        </Link>
        <p className="text-[13.5px] text-ink-muted">{lobby.event.organizer}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          <li className="inline-flex items-center gap-1.5">
            {open ? <CalendarClock aria-hidden className="size-4 text-ink-muted" /> : <Lock aria-hidden className="size-4 text-ink-muted" />}
            {open ? (lobby.event.primaryDeadlineAt ? `Pendaftaran ${daysLeftLabel(daysUntil(lobby.event.primaryDeadlineAt, now)).toLowerCase()}` : 'Pendaftaran masih buka') : 'Pendaftaran ditutup — hanya baca'}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="size-4 text-ink-muted" />
            {lobby.memberCount.toLocaleString('id-ID')} peserta di lobi
          </li>
        </ul>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {lobby.membership ? (
          <Badge variant="success">Kamu: {LOBBY_INTENT_LABEL[lobby.membership.intent]}</Badge>
        ) : (
          <Badge variant="outline">Belum bergabung</Badge>
        )}
        <Link href={`/lobi/${lobby.event.slug}`} className={buttonVariants({ variant: lobby.membership ? 'secondary' : 'primary', size: 'sm' })}>
          {lobby.membership ? 'Buka lobi' : 'Masuk lobi'} <ArrowRight aria-hidden />
        </Link>
      </div>
    </li>
  );
}

/**
 * "Lobi lomba saya" (ADR-071): satu baris per lomba yang SUDAH didaftar —
 * dari Papan lamaran ("Sudah daftar" ke atas) maupun formulir StudentFo.
 * Yang masih buka di atas; yang pendaftarannya sudah ditutup jadi arsip baca.
 */
export default async function LobbyListPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/lobi');
  const lobbies = await (await getEventRepository()).listMyLobbies(user.id);
  const now = new Date();
  const open = lobbies.filter((lobby) => isLobbyOpen(lobby.event, now));
  const archived = lobbies.filter((lobby) => !isLobbyOpen(lobby.event, now));

  return (
    <AccountShell user={user} active="lobi">
      <div className="flex max-w-[860px] flex-col gap-6">
        <header className="enter flex flex-col gap-2.5 [animation-duration:800ms]">
          <h1 className="flex items-center gap-2.5 text-[36px] leading-[1.05] tracking-[-0.04em]">
            <DoorOpen aria-hidden className="size-8 text-ink-muted" />
            Lobi lomba
          </h1>
          <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-ink-muted">
            Ruang untuk lomba yang sudah kamu daftar: cari tim atau partner di antara sesama peserta, dan ajak temanmu ikut sebelum
            pendaftarannya ditutup.
          </p>
        </header>

        <ActionFeedback params={params} />

        {lobbies.length === 0 ? (
          <section className="flex flex-col gap-3 rounded-[18px] border border-dashed border-line-strong p-6">
            <h2 className="text-lg font-semibold">Belum ada lomba yang kamu daftar</h2>
            <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-ink-soft">
              Lobi terbuka setelah kamu mendaftar sebuah lomba: lewat formulir StudentFo, atau tandai &ldquo;Sudah daftar&rdquo; di Papan lamaran
              setelah mendaftar di situs resminya.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/events?type=LOMBA" className={buttonVariants({ size: 'sm' })}>
                Cari lomba
              </Link>
              <Link href="/tracker" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Buka Papan lamaran
              </Link>
            </div>
          </section>
        ) : (
          <>
            {open.length > 0 && (
              <section aria-labelledby="lobi-buka" className="flex flex-col gap-3">
                <h2 id="lobi-buka" className="text-lg font-semibold">
                  Masih buka
                </h2>
                <ul className="flex flex-col gap-3">
                  {open.map((lobby) => (
                    <LobbyRow key={lobby.event.id} lobby={lobby} now={now} />
                  ))}
                </ul>
              </section>
            )}
            {archived.length > 0 && (
              <section aria-labelledby="lobi-arsip" className="flex flex-col gap-3">
                <h2 id="lobi-arsip" className="text-lg font-semibold">
                  Pendaftaran sudah ditutup
                </h2>
                <ul className="flex flex-col gap-3">
                  {archived.map((lobby) => (
                    <LobbyRow key={lobby.event.id} lobby={lobby} now={now} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AccountShell>
  );
}
