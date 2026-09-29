import Link from 'next/link';
import { Check, Ellipsis, UserPlus } from 'lucide-react';
import { removeConnectionAction, requestConnectionAction, respondConnectionAction, unblockPersonAction } from '@/app/connections/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { initialsOf } from '@/lib/initials';
import { daysAgoLabel, personMeta } from '@/lib/network';
import { cn } from '@/lib/utils';
import type { BlockedPerson, Connection, NetworkPerson } from '@/types/domain';
import { BLOCK_CONSEQUENCE, BlockPersonDetails, BlockPersonForm } from './block-person';
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

/** Profil publik (ADR-046). Orang yang diblokir tidak diberi tautan: profilnya memang tertutup. */
const profileHref = (userId: string) => `/orang/${encodeURIComponent(userId)}`;

function PersonHeading({ person, as: Heading = 'h3' }: { person: NetworkPerson; as?: 'h3' | 'h4' }) {
  const meta = personMeta(person);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Heading className="truncate text-[15px] font-semibold tracking-[-0.01em]">
        {/* Margin negatif: target sentuh 44px tanpa menggeser tata letak kartu. */}
        <Link href={profileHref(person.userId)} className="-my-3 inline-flex min-h-11 max-w-full items-center hover:underline">
          <span className="truncate">{person.fullName}</span>
        </Link>
      </Heading>
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
        <SubmitButton className={primary}>
          <UserPlus aria-hidden className="size-4" /> Hubungkan
          <span className="sr-only"> dengan {person.fullName}</span>
        </SubmitButton>
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
          <SubmitButton className={cn(primary, 'flex-1')}>
            <Check aria-hidden className="size-4" /> Terima<span className="sr-only"> ajakan {person.fullName}</span>
          </SubmitButton>
        </form>
        <form action={respondConnectionAction} className="flex flex-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="decision" value="decline" />
          <SubmitButton className={cn(secondary, 'flex-1')}>
            Tolak<span className="sr-only"> ajakan {person.fullName}</span>
          </SubmitButton>
        </form>
      </div>
      <BlockPersonDetails targetId={person.userId} name={person.fullName} returnTo={returnTo} className="-mb-2 -mt-1" />
    </article>
  );
}

export function ConnectionRow({ connection, returnTo, now }: { connection: Connection; returnTo: string; now: Date }) {
  const { person } = connection;
  return (
    <li id={`orang-${person.userId}`} className="relative flex scroll-mt-28 flex-wrap items-center gap-x-3 py-3 target:rounded-card target:bg-brand-soft target:px-2">
      <PersonAvatar name={person.fullName} solid size="sm" />
      <Link href={profileHref(person.userId)} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center pr-12">
        <span className="truncate text-sm font-semibold group-hover:underline">{person.fullName}</span>
        <span className="truncate text-[12px] text-ink-muted">
          {personMeta(person) || person.headline || 'Terhubung'} · sejak {daysAgoLabel(connection.respondedAt ?? connection.createdAt, now)}
        </span>
      </Link>
      {/*
        Memutus & memblokir di balik satu langkah konfirmasi. Dibuka INLINE
        (akordeon), bukan melayang: daftar ini wadah gulir ber-max-h, dan
        panel absolut di baris bawah terpotong di dalamnya.
      */}
      <details className="group w-0 open:w-full">
        <summary
          aria-label={`Opsi untuk ${person.fullName}`}
          className="absolute right-0 top-3 flex size-11 cursor-pointer list-none items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink group-open:bg-panel-nested group-open:text-ink [&::-webkit-details-marker]:hidden"
        >
          <Ellipsis aria-hidden className="size-4" />
        </summary>
        <div className="pop mt-3 flex flex-col gap-2 rounded-card border border-line bg-panel p-3">
          <p className="text-[13px] leading-snug">Putuskan koneksi dengan {person.fullName}? Dia tidak diberi tahu.</p>
          <form action={removeConnectionAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <input type="hidden" name="kind" value="remove" />
            <SubmitButton className={cn(secondary, 'w-full')}>
              Ya, putuskan
            </SubmitButton>
          </form>
          <p className="mt-1 border-t border-line pt-3 text-[13px] leading-snug">
            Atau blokir {person.fullName}? <span className="text-ink-muted">{BLOCK_CONSEQUENCE}</span>
          </p>
          <BlockPersonForm targetId={person.userId} name={person.fullName} returnTo={returnTo} />
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
      <Link href={profileHref(person.userId)} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-semibold group-hover:underline">{person.fullName}</span>
        <span className="truncate text-[12px] text-ink-muted">Menunggu jawaban · dikirim {daysAgoLabel(connection.createdAt, now)}</span>
      </Link>
      <form action={removeConnectionAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="connectionId" value={connection.id} />
        <input type="hidden" name="kind" value="cancel" />
        <SubmitButton className="flex min-h-11 items-center rounded-sm px-2.5 text-[13px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink">
          Batalkan<span className="sr-only"> ajakan ke {person.fullName}</span>
        </SubmitButton>
      </form>
    </li>
  );
}

export function BlockedRow({ person, returnTo, now }: { person: BlockedPerson; returnTo: string; now: Date }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <PersonAvatar name={person.fullName} solid={false} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{person.fullName}</span>
        <span className="truncate text-[12px] text-ink-muted">Diblokir {daysAgoLabel(person.blockedAt, now)}</span>
      </span>
      <form action={unblockPersonAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="targetId" value={person.userId} />
        <SubmitButton
          aria-label={`Buka blokir ${person.fullName}`}
          className="flex min-h-11 items-center rounded-sm px-2.5 text-[13px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
        >
          Buka blokir
        </SubmitButton>
      </form>
    </li>
  );
}
