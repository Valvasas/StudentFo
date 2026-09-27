'use client';

import Link from 'next/link';
import { ArrowUpRight, Check, UserPlus, Users, X } from 'lucide-react';
import { removeConnectionAction, requestConnectionAction, respondConnectionAction } from '@/app/connections/actions';
import { initialsOf } from '@/lib/initials';
import type { GraphNode } from '@/lib/network-graph';
import { cn } from '@/lib/utils';
import { ConnectionMessageField } from './connection-message-field';
import { KIND_LABEL, NodeGlyph } from './node-glyph';

const primary =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-card bg-brand px-3 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover';
const secondary =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-card border border-line-strong/70 px-3 text-[13.5px] font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested';

/**
 * Panel detail simpul terpilih. Aksinya `<form>` Server Action yang sama
 * dengan daftar di halaman — tidak ada jalur mutasi khusus peta, jadi
 * aturan & umpan baliknya identik.
 */
export function GraphDetail({
  node,
  neighbors,
  returnTo,
  onSelect,
  onClose,
}: {
  node: GraphNode;
  neighbors: readonly GraphNode[];
  returnTo: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const person = node.person;
  const people = neighbors.filter((item) => item.person);
  const others = neighbors.filter((item) => !item.person && item.kind !== 'me');

  return (
    <section aria-label={`Detail: ${node.label}`} className="pop flex flex-col gap-3.5 rounded-[16px] border border-line bg-panel p-4 shadow-overlay md:shadow-raised">
      <div className="flex items-start gap-3">
        {person || node.kind === 'me' ? (
          <span
            aria-hidden
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-pill text-[13px] font-semibold',
              node.kind === 'connection' || node.kind === 'me' ? 'bg-brand text-on-brand' : 'border border-line-strong bg-panel-nested',
            )}
          >
            {initialsOf(node.label)}
          </span>
        ) : (
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-card bg-panel-nested">
            <NodeGlyph kind={node.kind} className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{node.kind === 'interest' ? `#${node.label}` : node.label}</h3>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            <NodeGlyph kind={node.kind} className="size-2.5" />
            {KIND_LABEL[node.kind]}
            {person?.meta ? ` · ${person.meta}` : ''}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {person?.headline && <p className="text-[13.5px] leading-relaxed text-ink-soft">{person.headline}</p>}
      {person?.message && (
        <blockquote className="rounded-card bg-panel-nested px-3 py-2.5 text-[13.5px] leading-relaxed">“{person.message}”</blockquote>
      )}
      {person && person.reasons.length > 0 && (
        <ul aria-label="Kenapa disarankan" className="flex flex-wrap gap-1.5">
          {person.reasons.map((reason) => (
            <li key={reason} className="rounded-pill bg-brand-soft px-2.5 py-1 text-[12px] font-medium">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {node.kind === 'incoming' && person?.connectionId && (
        <div className="flex gap-2">
          <form action={respondConnectionAction} className="flex flex-1">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="connectionId" value={person.connectionId} />
            <input type="hidden" name="decision" value="accept" />
            <button type="submit" className={primary}>
              <Check aria-hidden className="size-4" /> Terima
            </button>
          </form>
          <form action={respondConnectionAction} className="flex flex-1">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="connectionId" value={person.connectionId} />
            <input type="hidden" name="decision" value="decline" />
            <button type="submit" className={secondary}>
              Tolak
            </button>
          </form>
        </div>
      )}

      {node.kind === 'suggestion' && person && (
        <form action={requestConnectionAction} className="flex flex-col gap-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="targetId" value={person.userId} />
          <ConnectionMessageField idPrefix={`peta-${person.userId}`} />
          <button type="submit" className={primary}>
            <UserPlus aria-hidden className="size-4" /> Hubungkan
          </button>
        </form>
      )}

      {node.kind === 'outgoing' && person?.connectionId && (
        <form action={removeConnectionAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="connectionId" value={person.connectionId} />
          <input type="hidden" name="kind" value="cancel" />
          <button type="submit" className={cn(secondary, 'w-full')}>
            Batalkan ajakan
          </button>
        </form>
      )}

      {node.kind === 'connection' && person && (
        <a href={`#orang-${person.userId}`} className={cn(secondary, 'w-full')}>
          <Users aria-hidden className="size-4" /> Lihat di daftar koneksi
        </a>
      )}

      {node.href && node.kind !== 'me' && (
        <Link href={node.href} className={cn(secondary, 'w-full')}>
          {node.kind === 'interest' ? `Lihat kegiatan ${node.label}` : 'Buka kegiatan'} <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      )}
      {node.kind === 'event' && node.href && (
        <Link href={`/teams?kegiatan=${encodeURIComponent(node.href.replace('/events/', ''))}`} className={cn(secondary, 'w-full')}>
          <Users aria-hidden className="size-4" /> Lihat tim kegiatan ini
        </Link>
      )}
      {node.kind === 'me' && (
        <a href="#pengaturan-jaringan" className={cn(secondary, 'w-full')}>
          Atur cara orang menemukanmu
        </a>
      )}

      {(people.length > 0 || others.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[12px] font-medium text-ink-muted">Tersambung ke {neighbors.length}</span>
          <ul className="flex flex-wrap gap-1.5">
            {[...people, ...others].slice(0, 14).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex min-h-9 max-w-[200px] items-center gap-1.5 rounded-pill border border-line px-2.5 text-[12.5px] font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
                >
                  <NodeGlyph kind={item.kind} className="size-2.5 shrink-0" />
                  <span className="truncate">{item.kind === 'me' ? 'Kamu' : item.kind === 'interest' ? `#${item.label}` : item.label || KIND_LABEL[item.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
