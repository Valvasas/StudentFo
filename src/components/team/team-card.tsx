import Link from 'next/link';
import { ArrowRight, Check, Crown, Send, Users } from 'lucide-react';
import { joinTeamAction } from '@/app/teams/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { Avatar, TINT_BG, type AvatarSize } from '@/components/ui/avatar';
import { SubmitButton } from '@/components/ui/submit-button';
import { getDeadlineState } from '@/lib/deadline';
import { tintOf } from '@/lib/tint';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, remainingSlots, type Team } from '@/types/domain';

export function TeamSlotsBadge({ team, className }: { team: Team; className?: string }) {
  const left = remainingSlots(team);
  return left === 0 ? (
    <span className={cn('inline-flex h-7 shrink-0 items-center rounded-pill border border-dashed border-ink-muted bg-panel px-3 text-[12.5px] font-medium text-ink-soft', className)}>Tim penuh</span>
  ) : (
    <span className={cn('inline-flex h-7 shrink-0 items-center rounded-pill bg-brand px-3 text-[12.5px] font-semibold text-on-brand', className)}>Butuh {left} orang</span>
  );
}

/**
 * Tumpukan avatar anggota + kursi kosong (kanvas Cari Tim). Tamu tidak boleh
 * membaca nama anggota (view team_member_profiles), jadi kursi terisi untuk
 * mereka hanya berupa titik di kertas polos — tanpa tint, karena tint
 * diturunkan dari id orang yang memang tidak boleh mereka ketahui.
 */
export function TeamSeats({ team, size = 'md' }: { team: Team; size?: 'md' | 'lg' }) {
  const seats = Math.min(team.slotsNeeded, 6);
  const avatar: AvatarSize = size === 'lg' ? 'md' : 'sm';
  const box = size === 'lg' ? 'size-11 text-sm' : 'size-9 text-xs';
  return (
    <div aria-hidden className="flex items-center">
      {Array.from({ length: seats }, (_, index) => {
        const member = team.members[index];
        const overlap = index > 0 ? '-ml-1.5' : undefined;
        if (index < team.memberCount && member) {
          return <Avatar key={member.userId} name={member.fullName} seed={member.userId} size={avatar} ring className={overlap} />;
        }
        return (
          <span
            key={`kursi-${index}`}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-pill bg-panel font-mono font-medium ring-[3px] ring-panel',
              box,
              overlap,
              index < team.memberCount ? 'bg-panel-nested text-ink-soft' : 'border-2 border-dashed border-line-strong text-ink-faint',
            )}
          >
            {index < team.memberCount ? '•' : '+'}
          </span>
        );
      })}
      {team.slotsNeeded > seats && <span className="ml-2 font-mono text-xs text-ink-muted">+{team.slotsNeeded - seats}</span>}
    </div>
  );
}

/** Meter kursi bersegmen: satu ruas per kursi (diskalakan di atas 10), terbaca sekilas tanpa angka. */
export function SeatMeter({ team, className }: { team: Team; className?: string }) {
  const segments = Math.min(team.slotsNeeded, 10);
  const filled = Math.round((Math.min(team.memberCount, team.slotsNeeded) / team.slotsNeeded) * segments);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span aria-hidden className="flex flex-1 gap-1">
        {Array.from({ length: segments }, (_, index) => (
          <span key={index} className={cn('h-1.5 flex-1 rounded-pill transition-colors duration-500', index < filled ? 'bg-brand' : 'bg-line')} />
        ))}
      </span>
      <span className="shrink-0 text-[12.5px] font-medium text-ink-muted">
        {team.memberCount} dari {team.slotsNeeded} anggota
      </span>
    </div>
  );
}

/**
 * Kartu tim: sampul bertint (diturunkan dari id tim, ADR-054) membawa jenis
 * kegiatan & tenggatnya; avatar anggota menimpa tepi sampul. Seluruh kartu
 * bisa diklik lewat judul yang direntangkan (`after:inset-0`); tombol gabung
 * duduk di atasnya (`z-10`) supaya tetap jadi aksi tersendiri.
 */
export function TeamCard({
  team,
  currentUserId,
  returnTo = '/teams',
  showEvent = true,
  missingEventLabel = 'Kegiatan tidak tayang',
}: {
  team: Team;
  currentUserId: string | null;
  returnTo?: string;
  showEvent?: boolean;
  /** Pratinjau /teams/baru: "belum dipilih", bukan "tidak tayang". */
  missingEventLabel?: string;
}) {
  const isMember = currentUserId !== null && team.members.some((member) => member.userId === currentUserId);
  const isFull = remainingSlots(team) === 0;
  const leader = team.members.find((member) => member.role === 'leader');
  // Tenggat "aman" ditulis sebagai teks polos; di atas tint ia butuh alas
  // kertas supaya kontrasnya sama dengan di halaman lain (tema gelap ±4:1 tanpa alas).
  const safeDeadline = team.event ? getDeadlineState(team.event.primaryDeadlineAt).urgency === 'safe' : false;

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[22px] border bg-panel transition-[border-color,box-shadow] duration-200 ease-snap focus-within:border-brand hover:border-line-strong hover:shadow-raised',
        isMember ? 'border-brand' : 'border-line',
      )}
    >
      <div className={cn('dot-grid flex items-start justify-between gap-3 px-5 pb-9 pt-4', TINT_BG[tintOf(team.id)])}>
        {team.event ? (
          <>
            <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-pill bg-panel px-3 text-[12.5px] font-semibold">
              <EventTypeIcon type={team.event.eventType} />
              {EVENT_TYPE_LABEL[team.event.eventType]}
            </span>
            <DeadlineTag deadlineAt={team.event.primaryDeadlineAt} className={cn('h-7 rounded-[999px]', safeDeadline ? 'bg-panel px-3' : 'px-2.5')} />
          </>
        ) : (
          <span className="inline-flex h-7 items-center rounded-pill bg-panel px-3 text-[12.5px] text-ink-muted">{missingEventLabel}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5">
        <div className="-mt-6 flex items-end justify-between gap-3">
          <TeamSeats team={team} />
          <TeamSlotsBadge team={team} className="mb-0.5" />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="font-display text-[18px] font-semibold leading-snug tracking-[-0.02em]">
            <Link
              href={`/teams/${team.id}`}
              className="inline-flex min-h-11 items-center decoration-2 underline-offset-4 after:absolute after:inset-0 after:rounded-[22px] after:content-[''] group-hover:underline"
            >
              {team.title}
            </Link>
          </h3>
          {showEvent && team.event && (
            <p className="-mt-1 line-clamp-1 text-[13px] text-ink-muted">
              untuk <span className="font-medium text-ink-soft">{team.event.title}</span>
            </p>
          )}
        </div>

        {team.description && <p className="line-clamp-3 text-[14px] leading-relaxed text-ink-soft">{team.description}</p>}

        <SeatMeter team={team} className="mt-auto pt-1" />

        <div className="flex min-h-11 items-center gap-3 border-t border-line pt-4">
          {leader ? (
            <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
              <Avatar name={leader.fullName} seed={leader.userId} size="xs" />
              <span className="truncate">
                <span className="font-semibold text-ink">{leader.fullName}</span> · ketua
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
              <Users aria-hidden className="size-3.5" /> Masuk untuk melihat anggota
            </span>
          )}
          <span className="relative z-10 ml-auto shrink-0">
            {isMember ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-highlight-soft px-3 text-[12.5px] font-semibold">
                <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> Timmu
              </span>
            ) : currentUserId && !isFull ? (
              <form action={joinTeamAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <SubmitButton
                  aria-label={`Ajukan gabung ke ${team.title}`}
                  className="flex h-11 items-center gap-1.5 rounded-pill bg-brand px-4 text-[13px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover"
                >
                  <Send aria-hidden className="size-3.5" /> Gabung
                </SubmitButton>
              </form>
            ) : (
              <ArrowRight aria-hidden className="size-5 text-ink-muted transition-transform duration-200 ease-snap group-hover:translate-x-1" />
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Pintasan ke tim yang sudah kamu ikuti — satu baris, bukan kartu penuh kedua. */
export function MyTeamLink({ team, userId }: { team: Team; userId: string }) {
  const isLeader = team.members.find((member) => member.userId === userId)?.role === 'leader';
  const Icon = isLeader ? Crown : Users;
  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex min-h-11 items-center gap-4 rounded-[18px] border border-line bg-panel p-3.5 pr-5 transition-[border-color,box-shadow] duration-200 ease-snap hover:border-line-strong hover:shadow-raised"
    >
      <span aria-hidden className={cn('dot-grid flex size-12 shrink-0 items-center justify-center rounded-[14px]', TINT_BG[tintOf(team.id)])}>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold group-hover:underline">{team.title}</span>
        <span className="truncate text-[12.5px] text-ink-muted">
          {isLeader ? 'Kamu ketua' : 'Kamu anggota'} · {team.memberCount} dari {team.slotsNeeded} orang
        </span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-200 ease-snap group-hover:translate-x-1" />
    </Link>
  );
}
