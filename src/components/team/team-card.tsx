import Link from 'next/link';
import { CalendarClock, UserPlus, Users } from 'lucide-react';
import { joinTeamAction } from '@/app/teams/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateId } from '@/lib/deadline';
import { EVENT_TYPE_LABEL, remainingSlots, type Team } from '@/types/domain';

export function TeamSlotsBadge({ team }: { team: Team }) {
  const left = remainingSlots(team);
  return left === 0 ? (
    <Badge variant="neutral">Tim penuh</Badge>
  ) : (
    <Badge variant="brand">{left} slot tersisa</Badge>
  );
}

export function TeamCard({
  team,
  currentUserId,
  returnTo = '/teams',
}: {
  team: Team;
  currentUserId: string | null;
  returnTo?: string;
}) {
  const isMember = currentUserId !== null && team.members.some((m) => m.userId === currentUserId);
  const isFull = remainingSlots(team) === 0;

  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">
          {/* min-h-11 + margin negatif: target sentuh 44px tanpa menggeser tata letak kartu. */}
          <Link href={`/teams/${team.id}`} className="-my-3 inline-flex min-h-11 items-center hover:text-brand-text">
            {team.title}
          </Link>
        </h3>
        <TeamSlotsBadge team={team} />
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

      {team.description && <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{team.description}</p>}

      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
        <Users aria-hidden className="size-4" />
        {team.memberCount} dari {team.slotsNeeded} anggota
      </p>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        {isMember ? (
          <Badge variant="success">Kamu anggota tim ini</Badge>
        ) : currentUserId && !isFull ? (
          <form action={joinTeamAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button type="submit" size="sm" variant="secondary">
              <UserPlus aria-hidden />
              Ajukan gabung
            </Button>
          </form>
        ) : null}

        <Link
          href={`/teams/${team.id}`}
          className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline"
        >
          Lihat tim
        </Link>
      </div>
    </article>
  );
}
