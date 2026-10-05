import Link from 'next/link';
import { BookOpen, Check, Ellipsis, GraduationCap, Heart, Link2, UserPlus, UsersRound, type LucideIcon } from 'lucide-react';
import { removeConnectionAction, requestConnectionAction, respondConnectionAction, unblockPersonAction } from '@/app/connections/actions';
import { CategoryIcon } from '@/components/listing/category-icon';
import { Avatar, TINT_BG } from '@/components/ui/avatar';
import { SubmitButton } from '@/components/ui/submit-button';
import { daysAgoLabel, personMeta, type SuggestionReason, type SuggestionReasonKind } from '@/lib/network';
import { coverTintOf } from '@/lib/tint';
import { cn } from '@/lib/utils';
import type { BlockedPerson, Connection, NetworkPerson } from '@/types/domain';
import { BLOCK_CONSEQUENCE, BlockPersonDetails, BlockPersonForm } from './block-person';
import { ConnectionMessageField } from './connection-message-field';

/**
 * Daftar orang di halaman Koneksi — Server Component, semua aksinya
 * `<form>` Server Action, jadi seluruh alur tetap jalan tanpa JavaScript.
 * Peta di atasnya hanyalah tampilan lain dari data yang sama.
 *
 * Hierarki tombol (ADR-054): hitam pekat HANYA untuk aksi yang ditunggu
 * orang lain (Terima). "Hubungkan" di kartu saran berupa garis tinta yang
 * terisi saat disentuh — enam tombol hitam berjejer membuat layar saran
 * terbaca sebagai dinding ajakan, bukan daftar orang.
 */

const primary =
  'flex h-11 items-center justify-center gap-1.5 rounded-pill bg-brand px-4 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover';
const secondary =
  'flex h-11 items-center justify-center gap-1.5 rounded-pill border border-line-strong/70 bg-panel px-4 text-[13.5px] font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested';
const outline =
  'flex h-11 w-full items-center justify-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-panel px-4 text-[13.5px] font-semibold text-ink transition-colors duration-150 ease-snap hover:bg-brand hover:text-on-brand';

const REASON_ICON: Record<SuggestionReasonKind, LucideIcon> = {
  team: UsersRound,
  mutual: Link2,
  interest: Heart,
  major: BookOpen,
  level: GraduationCap,
};

/** Profil publik (ADR-046). Orang yang diblokir tidak diberi tautan: profilnya memang tertutup. */
const profileHref = (userId: string) => `/orang/${encodeURIComponent(userId)}`;

function PersonHeading({ person, as: Heading = 'h3', link = true }: { person: NetworkPerson; as?: 'h3' | 'h4'; link?: boolean }) {
  const meta = personMeta(person);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Heading className="truncate font-display text-[16.5px] font-semibold tracking-[-0.015em]">
        {link ? (
          // Margin negatif: target sentuh 44px tanpa menggeser tata letak kartu.
          <Link href={profileHref(person.userId)} className="-my-3 inline-flex min-h-11 max-w-full items-center hover:underline">
            <span className="truncate">{person.fullName}</span>
          </Link>
        ) : (
          person.fullName
        )}
      </Heading>
      {meta && <span className="truncate text-[12.5px] text-ink-muted">{meta}</span>}
    </span>
  );
}

function InterestList({ slugs, highlight, categoryName }: { slugs: readonly string[]; highlight: readonly string[]; categoryName: (slug: string) => string }) {
  if (slugs.length === 0) return null;
  return (
    <ul aria-label="Minat" className="flex flex-wrap gap-1.5">
      {slugs.slice(0, 4).map((slug) => {
        const shared = highlight.includes(slug);
        return (
          <li
            key={slug}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-[12px]',
              shared ? 'bg-highlight-soft font-semibold text-ink' : 'bg-panel-nested font-medium text-ink-soft',
            )}
          >
            <CategoryIcon slug={slug} className="size-3" />
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
  preview = false,
}: {
  person: NetworkPerson;
  reasons: readonly SuggestionReason[];
  viewerInterests: readonly string[];
  categoryName: (slug: string) => string;
  returnTo: string;
  /** Pratinjau "yang dilihat orang lain" di Pengaturan: tanpa form (tidak boleh bersarang di form pengaturan). */
  preview?: boolean;
}) {
  return (
    <article
      id={preview ? undefined : `orang-${person.userId}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 ease-snap focus-within:border-brand hover:border-line-strong hover:shadow-raised"
    >
      <div aria-hidden className={cn('dot-grid h-[68px]', TINT_BG[coverTintOf(person.userId)])} />
      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5">
        <Avatar name={person.fullName} seed={person.userId} size="lg" ring className="-mt-8" />
        <PersonHeading person={person} link={!preview} />
        {person.headline && <p className="-mt-1 line-clamp-2 text-[14px] leading-relaxed text-ink-soft">{person.headline}</p>}
        {/* Alasan sudah menyebut minat yang sama; chip minat di sampingnya
            mengulang fakta yang sama. Chip hanya tampil saat tidak ada alasan
            lain yang bisa ditunjukkan. Dua alasan terkuat saja (urutan dari
            suggestionReasonItems): yang ketiga jarang mengubah keputusan. */}
        {reasons.length === 0 && <InterestList slugs={person.interests} highlight={viewerInterests} categoryName={categoryName} />}
        {reasons.length > 0 && (
          <ul aria-label="Kenapa disarankan" className="flex flex-col gap-1.5">
            {reasons.slice(0, 2).map((reason) => {
              const Icon = REASON_ICON[reason.kind];
              return (
                <li key={reason.text} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-panel-nested">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 truncate">{reason.text}</span>
                </li>
              );
            })}
          </ul>
        )}
        {preview ? (
          <span aria-hidden className={cn(outline, 'mt-auto')}>
            <UserPlus className="size-4" /> Hubungkan
          </span>
        ) : (
          <form action={requestConnectionAction} className="mt-auto flex flex-col gap-1">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="targetId" value={person.userId} />
            <ConnectionMessageField idPrefix={`saran-${person.userId}`} />
            <SubmitButton className={outline}>
              <UserPlus aria-hidden className="size-4" /> Hubungkan
              <span className="sr-only"> dengan {person.fullName}</span>
            </SubmitButton>
          </form>
        )}
      </div>
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
    <article id={`orang-${person.userId}`} className="flex h-full flex-col gap-4 rounded-[22px] border border-line bg-panel p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={person.fullName} seed={person.userId} size="lg" />
        <PersonHeading person={person} />
        <span className="ml-auto inline-flex h-6 shrink-0 items-center self-start rounded-pill bg-highlight-soft px-2.5 text-[11.5px] font-semibold">
          {daysAgoLabel(connection.createdAt, now)}
        </span>
      </div>
      {connection.message ? (
        // Gelembung berekor ke arah avatar: pesan ini kalimat orangnya, bukan teks sistem.
        <blockquote className="relative ml-2 rounded-[18px] rounded-tl-[4px] bg-panel-nested px-4 py-3 text-[14px] leading-relaxed">
          <span aria-hidden className="absolute -top-2 left-0 size-3 bg-panel-nested [clip-path:polygon(0_0,100%_100%,0_100%)]" />“{connection.message}”
        </blockquote>
      ) : (
        person.headline && <p className="text-[14px] leading-relaxed text-ink-soft">{person.headline}</p>
      )}
      <InterestList slugs={person.interests} highlight={viewerInterests} categoryName={categoryName} />
      <div className="mt-auto flex gap-2">
        <form action={respondConnectionAction} className="flex flex-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="decision" value="accept" />
          <SubmitButton className={cn(primary, 'flex-1')}>
            <Check aria-hidden className="size-4" strokeWidth={2.6} /> Terima<span className="sr-only"> ajakan {person.fullName}</span>
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
      <BlockPersonDetails targetId={person.userId} name={person.fullName} returnTo={returnTo} className="-mb-2 -mt-2" />
    </article>
  );
}

export function ConnectionRow({ connection, returnTo, now }: { connection: Connection; returnTo: string; now: Date }) {
  const { person } = connection;
  return (
    <li
      id={`orang-${person.userId}`}
      className="relative flex scroll-mt-28 flex-wrap items-center gap-x-3.5 px-2 py-3 transition-colors duration-150 first:rounded-t-[16px] last:rounded-b-[16px] hover:bg-panel-nested/60 target:bg-highlight-soft"
    >
      <Avatar name={person.fullName} seed={person.userId} size="md" />
      <Link href={profileHref(person.userId)} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center pr-12">
        <span className="truncate text-[15px] font-semibold group-hover:underline">{person.fullName}</span>
        <span className="truncate text-[12.5px] text-ink-muted">
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
          className="absolute right-2 top-3.5 flex size-11 cursor-pointer list-none items-center justify-center rounded-pill text-ink-muted hover:bg-panel hover:text-ink group-open:bg-panel group-open:text-ink [&::-webkit-details-marker]:hidden"
        >
          <Ellipsis aria-hidden className="size-4" />
        </summary>
        <div className="pop mb-1 mt-3 flex flex-col gap-2 rounded-[16px] border border-line bg-panel p-4">
          <p className="text-[13px] leading-snug">Putuskan koneksi dengan {person.fullName}? Dia tidak diberi tahu.</p>
          <form action={removeConnectionAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <input type="hidden" name="kind" value="remove" />
            <SubmitButton className={cn(secondary, 'w-full')}>Ya, putuskan</SubmitButton>
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
    <li id={`orang-${person.userId}`} className="flex items-center gap-3.5 px-2 py-3">
      <Avatar name={person.fullName} seed={person.userId} size="md" />
      <Link href={profileHref(person.userId)} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-[15px] font-semibold group-hover:underline">{person.fullName}</span>
        <span className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-muted">
          <span aria-hidden className="breathe size-1.5 shrink-0 rounded-pill bg-ink-muted" />
          Menunggu jawaban · dikirim {daysAgoLabel(connection.createdAt, now)}
        </span>
      </Link>
      <form action={removeConnectionAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="connectionId" value={connection.id} />
        <input type="hidden" name="kind" value="cancel" />
        <SubmitButton className="flex min-h-11 items-center rounded-pill px-3.5 text-[13px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink">
          Batalkan<span className="sr-only"> ajakan ke {person.fullName}</span>
        </SubmitButton>
      </form>
    </li>
  );
}

export function BlockedRow({ person, returnTo, now }: { person: BlockedPerson; returnTo: string; now: Date }) {
  return (
    <li className="flex items-center gap-3.5 px-2 py-3">
      {/* Tanpa tint: identitas warna adalah bagian dari "saling mengenali" yang justru diputus blokir. */}
      <Avatar name={person.fullName} seed={person.userId} size="md" className="bg-panel-nested text-ink-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{person.fullName}</span>
        <span className="truncate text-[12.5px] text-ink-muted">Diblokir {daysAgoLabel(person.blockedAt, now)}</span>
      </span>
      <form action={unblockPersonAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="targetId" value={person.userId} />
        <SubmitButton
          aria-label={`Buka blokir ${person.fullName}`}
          className="flex min-h-11 items-center rounded-pill px-3.5 text-[13px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
        >
          Buka blokir
        </SubmitButton>
      </form>
    </li>
  );
}
