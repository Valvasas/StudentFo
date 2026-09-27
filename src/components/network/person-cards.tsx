import { Check, UserMinus, UserPlus } from 'lucide-react';
import { removeConnectionAction, requestConnectionAction, respondConnectionAction } from '@/app/connections/actions';
import { initialsOf } from '@/lib/initials';
import { daysAgoLabel, personMeta } from '@/lib/network';
import { cn } from '@/lib/utils';
import type { Connection, NetworkPerson } from '@/types/domain';
import { ConnectionMessageField } from './connection-message-field';

/**
 * Daftar orang di halaman Koneksi — Server Component, semua aksinya
 * `<form>` Server Action, jadi seluruh alur tetap jalan tanpa JavaScript.
 * Peta di atasnya hanyalah tampilan lain dari data yang sama.
 */

const primary =
  'flex h-11 items-center justify-center gap-1.5 rounded-card bg-brand px-4 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover';
const secondary =
  'flex h-11 items-center justify-center gap-1.5 rounded-card border border-line-strong/70 px-4 text-[13.5px] font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested';

export function PersonAvatar({ name, solid, size = 'md' }: { name: string; solid: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-pill font-semibold',
        size === 'md' ? 'size-11 text-[13px]' : 'size-9 text-xs',
        solid ? 'bg-brand text-on-brand' : 'border border-line-strong bg-panel-nested text-ink',
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

function PersonHeading({ person, as: Heading = 'h3' }: { person: NetworkPerson; as?: 'h3' | 'h4' }) {
  const meta = personMeta(person);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Heading className="truncate text-[15px] font-semibold tracking-[-0.01em]">{person.fullName}</Heading>
      {meta && <span className="truncate text-[12.5px] text-ink-muted">{meta}</span>}
    </span>
  );
}

function InterestList({ slugs, highlight, categoryName }: { slugs: readonly string[]; highlight: readonly string[]; categoryName: (slug: string) => string }) {
  if (slugs.length === 0) return null;
  return (
    <ul aria-label="Minat" className="flex flex-wrap gap-1">
      {slugs.slice(0, 4).map((slug) => {
        const shared = highlight.includes(slug);
        return (
          <li
            key={slug}
            className={cn('rounded-pill px-2 py-0.5 text-[11.5px] font-medium', shared ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-soft')}
          >
            {categoryName(slug)}
            {shared && <span className="sr-only"> (minat yang sama denganmu)</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function SuggestionCard({
  person,
  reasons,
  viewerInterests,
  categoryName,
  returnTo,
}: {
  person: NetworkPerson;
  reasons: readonly string[];
  viewerInterests: readonly string[];
  categoryName: (slug: string) => string;
  returnTo: string;
}) {
  return (
    <article id={`orang-${person.userId}`} className="flex h-full flex-col gap-3.5 rounded-[18px] border border-line p-5 transition-colors duration-200 ease-snap hover:border-line-strong">
      <div className="flex items-center gap-3">
        <PersonAvatar name={person.fullName} solid={false} />
        <PersonHeading person={person} />
      </div>
      {person.headline && <p className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{person.headline}</p>}
      <InterestList slugs={person.interests} highlight={viewerInterests} categoryName={categoryName} />
      {reasons.length > 0 && (
        <ul aria-label="Kenapa disarankan" className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
          {reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-pill bg-ink-muted" />
              {reason}
            </li>
          ))}
        </ul>
      )}
      <form action={requestConnectionAction} className="mt-auto flex flex-col gap-1.5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="targetId" value={person.userId} />
        <ConnectionMessageField idPrefix={`saran-${person.userId}`} />
        <button type="submit" className={primary}>
          <UserPlus aria-hidden className="size-4" /> Hubungkan
          <span className="sr-only"> dengan {person.fullName}</span>
        </button>
      </form>
    </article>
  );
}

export function IncomingRequestCard({
  connection,
  categoryName,
  viewerInterests,
  returnTo,
  now,
}: {
  connection: Connection;
  categoryName: (slug: string) => string;
  viewerInterests: readonly string[];
  returnTo: string;
  now: Date;
}) {
  const { person } = connection;
  return (
    <article id={`orang-${person.userId}`} className="flex h-full flex-col gap-3 rounded-[18px] border border-brand p-5">
      <div className="flex items-center gap-3">
        <PersonAvatar name={person.fullName} solid={false} />
        <PersonHeading person={person} />
        <span className="ml-auto shrink-0 self-start font-mono text-[11.5px] text-ink-muted">{daysAgoLabel(connection.createdAt, now)}</span>
      </div>
      {connection.message ? (
        <blockquote className="rounded-card bg-panel-nested px-3.5 py-3 text-[13.5px] leading-relaxed">“{connection.message}”</blockquote>
      ) : (
        person.headline && <p className="text-[13.5px] leading-relaxed text-ink-soft">{person.headline}</p>
      )}
      <InterestList slugs={person.interests} highlight={viewerInterests} categoryName={categoryName} />
      <div className="mt-auto flex gap-2">
        <form action={respondConnectionAction} className="flex flex-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="decision" value="accept" />
          <button type="submit" className={cn(primary, 'flex-1')}>
            <Check aria-hidden className="size-4" /> Terima<span className="sr-only"> ajakan {person.fullName}</span>
          </button>
        </form>
        <form action={respondConnectionAction} className="flex flex-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="decision" value="decline" />
          <button type="submit" className={cn(secondary, 'flex-1')}>
            Tolak<span className="sr-only"> ajakan {person.fullName}</span>
          </button>
        </form>
      </div>
    </article>
  );
}

export function ConnectionRow({ connection, returnTo, now }: { connection: Connection; returnTo: string; now: Date }) {
  const { person } = connection;
  return (
    <li id={`orang-${person.userId}`} className="flex scroll-mt-28 items-center gap-3 py-3 target:rounded-card target:bg-brand-soft target:px-2">
      <PersonAvatar name={person.fullName} solid size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{person.fullName}</span>
        <span className="truncate text-[12px] text-ink-muted">
          {personMeta(person) || person.headline || 'Terhubung'} · sejak {daysAgoLabel(connection.respondedAt ?? connection.createdAt, now)}
        </span>
      </span>
      {/* Memutus koneksi tidak bisa dibatalkan, jadi butuh satu langkah konfirmasi. */}
      <details className="group relative">
        <summary
          aria-label={`Opsi untuk ${person.fullName}`}
          className="flex size-11 cursor-pointer list-none items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink [&::-webkit-details-marker]:hidden"
        >
          <UserMinus aria-hidden className="size-4" />
        </summary>
        <div className="pop absolute right-0 top-[calc(100%+4px)] z-10 flex w-60 flex-col gap-2 rounded-modal border border-line bg-panel p-3 shadow-overlay">
          <p className="text-[13px] leading-snug">Putuskan koneksi dengan {person.fullName}? Dia tidak diberi tahu.</p>
          <form action={removeConnectionAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <input type="hidden" name="kind" value="remove" />
            <button type="submit" className="flex h-11 w-full items-center justify-center rounded-card border border-danger-line bg-danger-soft text-[13.5px] font-semibold text-danger">
              Ya, putuskan
            </button>
          </form>
        </div>
      </details>
    </li>
  );
}

export function OutgoingRow({ connection, returnTo, now }: { connection: Connection; returnTo: string; now: Date }) {
  const { person } = connection;
  return (
    <li id={`orang-${person.userId}`} className="flex items-center gap-3 py-3">
      <PersonAvatar name={person.fullName} solid={false} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{person.fullName}</span>
        <span className="truncate text-[12px] text-ink-muted">Menunggu jawaban · dikirim {daysAgoLabel(connection.createdAt, now)}</span>
      </span>
      <form action={removeConnectionAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="connectionId" value={connection.id} />
        <input type="hidden" name="kind" value="cancel" />
        <button type="submit" className="flex min-h-11 items-center rounded-sm px-2.5 text-[13px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink">
          Batalkan<span className="sr-only"> ajakan ke {person.fullName}</span>
        </button>
      </form>
    </li>
  );
}
