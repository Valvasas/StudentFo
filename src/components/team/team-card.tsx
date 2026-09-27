import Link from 'next/link';
import { Check, Send } from 'lucide-react';
import { joinTeamAction } from '@/app/teams/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, remainingSlots, type Team } from '@/types/domain';

export function TeamSlotsBadge({ team }: { team: Team }) {
  const left = remainingSlots(team);
  return left === 0 ? (
    <span className="inline-flex h-7 shrink-0 items-center rounded-sm border border-dashed border-ink-muted px-2.5 text-[12.5px] font-medium text-ink-soft">Tim penuh</span>
  ) : (
    <span className="inline-flex h-7 shrink-0 items-center rounded-sm bg-brand px-2.5 text-[12.5px] font-semibold text-on-brand">Butuh {left} orang</span>
  );
}

/**
 * Tumpukan inisial anggota + kursi kosong (kanvas Cari Tim). Tamu tidak
 * boleh membaca nama anggota (view team_member_profiles), jadi kursi terisi
 * untuk mereka hanya berupa titik.
 */
export function TeamSeats({ team, size = 'md' }: { team: Team; size?: 'md' | 'lg' }) {
  const seats = Math.min(team.slotsNeeded, 8);
  const box = size === 'lg' ? 'size-11 text-[13px]' : 'size-9 text-[11px]';
  return (
    <div aria-hidden className="flex items-center">
      {Array.from({ length: seats }, (_, index) => {
        const filled = index < team.memberCount;
        const name = team.members[index]?.fullName;
        return (
          <span
            key={index}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full border-2 font-mono font-medium',
              box,
              index > 0 && '-ml-2',
              filled ? 'border-panel bg-brand text-on-brand' : 'border-dashed border-line-strong bg-panel text-ink-faint',
            )}
          >
            {filled ? (name ? initialsOf(name) : '•') : '+'}
          </span>
        );
      })}
      {team.slotsNeeded > seats && <span className="ml-1.5 text-xs text-ink-muted">+{team.slotsNeeded - seats}</span>}
    </div>
  );
}

export function TeamCard({
  team,
  currentUserId,
  returnTo = '/teams',
  showEvent = true,
}: {
  team: Team;
  currentUserId: string | null;
  returnTo?: string;
  showEvent?: boolean;
}) {
  const isMember = currentUserId !== null && team.members.some((member) => member.userId === currentUserId);
  const isFull = remainingSlots(team) === 0;
  const leader = team.members.find((member) => member.role === 'leader');

  return (
    <article
      className={cn(
        'flex h-full flex-col gap-4 rounded-[14px] border bg-panel p-5 transition-[border-color,box-shadow] duration-200 ease-snap focus-within:border-brand hover:border-line-strong hover:shadow-[0_14px_34px_rgba(0,0,0,.07)]',
        isMember ? 'border-brand' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <TeamSeats team={team} />
        <TeamSlotsBadge team={team} />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[16.5px] font-semibold leading-snug tracking-[-0.015em]">
          {/* min-h-11 + margin negatif: target sentuh 44px tanpa menggeser tata letak kartu. */}
          <Link href={`/teams/${team.id}`} className="inline-flex min-h-11 items-center hover:underline">
            {team.title}
          </Link>
        </h3>
        <p className="text-[13px] text-ink-muted">
          {team.memberCount} dari {team.slotsNeeded} anggota
          {leader && ` · ketua ${leader.fullName}`}
        </p>
      </div>

      {team.description && <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-soft">{team.description}</p>}

      {showEvent &&
        (team.event ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-card bg-panel-nested px-3 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1 basis-40 truncate font-medium">{team.event.title}</span>
            <span className="text-ink-muted">{EVENT_TYPE_LABEL[team.event.eventType]}</span>
            <DeadlineTag deadlineAt={team.event.primaryDeadlineAt} />
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Kegiatan sudah tidak tayang.</p>
        ))}

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-4">
        {isMember ? (
          <span className="inline-flex h-9 items-center gap-1.5 text-[13.5px] font-semibold">
            <Check aria-hidden className="size-4" strokeWidth={2.4} /> Kamu anggota tim ini
          </span>
        ) : currentUserId && !isFull ? (
          <form action={joinTeamAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              aria-label={`Ajukan gabung ke ${team.title}`}
              className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover"
            >
              <Send aria-hidden className="size-3.5" />
              Ajukan gabung
            </button>
          </form>
        ) : null}
        <Link
          href={`/teams/${team.id}`}
          aria-label={`Lihat tim ${team.title}`}
          className="ml-auto inline-flex min-h-11 items-center text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
        >
          Lihat tim
        </Link>
      </div>
    </article>
  );
}
