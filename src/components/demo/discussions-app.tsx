'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, BadgeCheck, Check, ChevronDown, MessageSquare, Pin, Plus, Send, ShieldCheck, Users } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import {
  BODY_MAX,
  CHANNELS,
  DEMO_GROUPS,
  DISCOVER_GROUPS,
  DISCOVER_SLUGS,
  DISCUSSIONS_KEY,
  EMPTY_DISCUSSIONS,
  POSTABLE_CHANNELS,
  discoverGroupId,
  TITLE_MAX,
  parseDiscussions,
  type ChannelKey,
  type DemoGroup,
  type DemoThread,
  type DiscussionState,
} from '@/lib/demo/discussions';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

export interface GroupEvent {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly organizer: string;
}

const channelLabel = (key: ChannelKey) => CHANNELS.find((channel) => channel.key === key)?.label ?? key;
const inputClass =
  'w-full rounded-card border border-line-strong/70 bg-panel px-3.5 text-base hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function Author({ name, official, time }: { name: string; official?: boolean; time: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
      <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px]', official ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink')}>
        {initialsOf(name)}
      </span>
      <span className="truncate font-semibold text-ink">{name}</span>
      {official && (
        <span className="inline-flex items-center gap-1 rounded-[5px] border border-brand px-1.5 py-px text-[11px] font-semibold text-ink">
          <BadgeCheck aria-hidden className="size-3" /> Panitia
        </span>
      )}
      <span aria-hidden>·</span>
      <span className="shrink-0">{time}</span>
    </span>
  );
}

/**
 * Ruang diskusi (kanvas Ruang Diskusi): grup per kegiatan, kanal, utas,
 * balasan, dan suara. Mode data contoh saja — lihat lib/demo/discussions.ts.
 */
export function DiscussionsApp({ events, userName }: { events: Readonly<Record<string, GroupEvent>>; userName: string }) {
  const [state, save, loaded] = useDemoStore<DiscussionState>(DISCUSSIONS_KEY, EMPTY_DISCUSSIONS, parseDiscussions);
  const groups = [...DEMO_GROUPS, ...DISCOVER_GROUPS.filter((group) => state.joined.includes(group.eventSlug))].filter(
    (group) => events[group.eventSlug],
  );
  const discover = DISCOVER_SLUGS.filter((slug) => events[slug] && !state.joined.includes(slug));
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [channel, setChannel] = useState<ChannelKey | 'semua'>('semua');
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', channel: 'tanya' as ChannelKey });
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (composing) titleRef.current?.focus();
  }, [composing]);
  useEffect(() => {
    if (openThread) headingRef.current?.focus({ preventScroll: true });
  }, [openThread]);

  const group: DemoGroup | undefined = groups.find((item) => item.id === groupId) ?? groups[0];
  if (!group) return <p className="text-sm text-ink-muted">Belum ada grup diskusi.</p>;
  const event = events[group.eventSlug]!;
  const allThreads: DemoThread[] = [...(state.threads[group.id] ?? []), ...group.threads];
  const threads = allThreads
    .filter((thread) => channel === 'semua' || thread.channel === channel)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
  const current = openThread ? allThreads.find((thread) => thread.id === openThread) : undefined;
  const votes = (thread: DemoThread) => thread.votes + (state.votes.includes(thread.id) ? 1 : 0);
  const repliesOf = (thread: DemoThread) => [...thread.replies, ...(state.replies[thread.id] ?? [])];

  const toggleVote = (thread: DemoThread) =>
    save({ ...state, votes: state.votes.includes(thread.id) ? state.votes.filter((id) => id !== thread.id) : [...state.votes, thread.id] });

  const pickGroup = (id: string) => {
    setGroupId(id);
    setOpenThread(null);
    setChannel('semua');
    setSwitcher(false);
  };

  const joinGroup = (slug: string) => {
    save({ ...state, joined: [...state.joined, slug] });
    pickGroup(discoverGroupId(slug));
    setToast('Bergabung. Mulai utas pertama di grup ini.');
  };

  const leaveGroup = (slug: string) => {
    save({ ...state, joined: state.joined.filter((item) => item !== slug) });
    pickGroup(groups[0]?.id ?? '');
    setToast('Keluar dari grup.');
  };

  const submitThread = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (title.length < 5) {
      setError('Judul minimal 5 karakter.');
      titleRef.current?.focus();
      return;
    }
    const thread: DemoThread = { id: `u-${Date.now().toString(36)}`, channel: draft.channel, author: userName, time: 'Baru saja', votes: 0, title, body, replies: [] };
    save({ ...state, threads: { ...state.threads, [group.id]: [thread, ...(state.threads[group.id] ?? [])] } });
    setDraft({ title: '', body: '', channel: draft.channel });
    setComposing(false);
    setError('');
    setToast('Utas terkirim.');
  };

  const submitReply = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const text = reply.trim().slice(0, BODY_MAX);
    if (!text || !current) return;
    save({ ...state, replies: { ...state.replies, [current.id]: [...(state.replies[current.id] ?? []), { author: userName, time: 'Baru saja', text }] } });
    setReply('');
    setToast('Balasan terkirim.');
  };

  const groupList = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="px-2 font-mono text-[11px] tracking-[.08em] text-ink-muted">GRUP KAMU</span>
        {groups.map((item) => {
          const info = events[item.eventSlug]!;
          const active = item.id === group.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => pickGroup(item.id)}
              className={cn('flex min-h-11 items-center gap-3 rounded-card px-2 py-2 text-left transition-colors duration-150', active ? 'bg-panel-nested' : 'hover:bg-panel-nested/60')}
            >
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand font-mono text-[11px] text-on-brand">
                {initialsOf(info.title)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate text-[13.5px]', active ? 'font-semibold' : 'font-medium')}>{info.title}</span>
                <span className="text-[11.5px] text-ink-muted">{item.members.toLocaleString('id-ID')} anggota</span>
              </span>
              {item.fresh > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-brand px-1.5 text-[11px] font-semibold text-on-brand">
                  {item.fresh}
                  <span className="sr-only"> utas baru</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {discover.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="px-2 font-mono text-[11px] tracking-[.08em] text-ink-muted">TEMUKAN GRUP</span>
          {discover.map((slug) => {
            const info = events[slug]!;
            return (
              <div key={slug} className="flex items-center gap-2 px-2 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{info.title}</span>
                  <span className="text-[11.5px] text-ink-muted">{info.type}</span>
                </span>
                <button
                  type="button"
                  disabled={!loaded}
                  onClick={() => joinGroup(slug)}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-sm border border-line-strong/70 px-2.5 text-[12.5px] font-semibold hover:bg-panel-nested"
                >
                  Gabung
                  <span className="sr-only"> grup {info.title}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Grup diskusi" className="hidden lg:block">
        {groupList}
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        {/* Pengganti kolom grup di layar sempit. */}
        <div className="lg:hidden">
          <button
            type="button"
            aria-expanded={switcher}
            onClick={() => setSwitcher((value) => !value)}
            className="flex min-h-12 w-full items-center gap-3 rounded-card border border-line px-3.5 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11.5px] text-ink-muted">Grup aktif · {groups.length} grup kamu</span>
              <span className="truncate text-sm font-semibold">{event.title}</span>
            </span>
            <span className="text-[13px] font-medium">Ganti grup</span>
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', switcher && 'rotate-180')} />
          </button>
          {switcher && <div className="pop mt-2 rounded-card border border-line bg-panel p-3 shadow-overlay">{groupList}</div>}
        </div>

        <section className="enter flex flex-col gap-3 rounded-[18px] bg-inverse p-5 text-on-inverse [animation-duration:600ms] sm:p-6">
          <span className="text-[12.5px] text-on-inverse-muted">
            {event.type} · {event.organizer}
          </span>
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.025em] text-on-inverse">{event.title}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-on-inverse-muted">
            <span className="flex items-center gap-1.5">
              <Users aria-hidden className="size-4" /> {group.members.toLocaleString('id-ID')} anggota
              {group.online > 0 && ` · ${group.online} sedang aktif`}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-4" /> Dimoderasi panitia
            </span>
            {state.joined.includes(group.eventSlug) && (
              <button type="button" onClick={() => leaveGroup(group.eventSlug)} className="flex min-h-11 items-center font-medium text-on-inverse-muted underline underline-offset-[3px] hover:text-on-inverse">
                Keluar grup
              </button>
            )}
            <Link href={`/events/${event.slug}`} className="ml-auto flex min-h-11 items-center gap-1.5 font-semibold text-on-inverse hover:underline">
              Detail kegiatan <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>

        {current ? (
          <article aria-labelledby="utas-title" className="flex flex-col gap-4 rounded-[18px] border border-line p-5 sm:p-6">
            <button type="button" onClick={() => setOpenThread(null)} className="-ml-2 flex min-h-11 items-center gap-1.5 self-start rounded-sm px-2 text-[13.5px] font-medium text-ink-muted hover:text-ink">
              <ArrowLeft aria-hidden className="size-4" /> Semua utas
            </button>
            <span className="text-[12.5px] font-medium text-ink-muted"># {channelLabel(current.channel)}</span>
            <h3 id="utas-title" ref={headingRef} tabIndex={-1} className="text-[22px] font-bold leading-tight tracking-[-0.025em] outline-none">
              {current.title}
            </h3>
            <Author name={current.author} official={current.official} time={current.time} />
            {current.body && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{current.body}</p>}
            <div className="flex items-center gap-2 border-y border-line py-2">
              <button
                type="button"
                aria-pressed={state.votes.includes(current.id)}
                disabled={!loaded}
                onClick={() => toggleVote(current)}
                className={cn('flex h-10 items-center gap-1.5 rounded-sm px-3 text-sm font-semibold', state.votes.includes(current.id) ? 'bg-brand text-on-brand' : 'hover:bg-panel-nested')}
              >
                <ArrowUp aria-hidden className="size-4" /> {votes(current)}
                <span className="sr-only"> suara, dukung utas ini</span>
              </button>
              <span className="text-[13px] text-ink-muted">{repliesOf(current).length} balasan</span>
            </div>
            <ol className="flex flex-col gap-3">
              {repliesOf(current).map((item, index) => (
                <li key={`${item.author}-${index}`} className={cn('flex flex-col gap-2 rounded-card p-4', item.official ? 'border border-brand' : 'bg-panel-nested')}>
                  {item.official && <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[.08em]"><Check aria-hidden className="size-3" /> JAWABAN PANITIA</span>}
                  <Author name={item.author} official={item.official} time={item.time} />
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{item.text}</p>
                </li>
              ))}
            </ol>
            <form onSubmit={submitReply} className="flex items-end gap-2">
              <label htmlFor="balasan" className="sr-only">
                Tulis balasan
              </label>
              <textarea
                id="balasan"
                rows={2}
                maxLength={BODY_MAX}
                value={reply}
                onChange={(changeEvent) => setReply(changeEvent.target.value)}
                placeholder="Tulis balasan…"
                className={cn(inputClass, 'min-h-11 resize-y py-2.5 leading-snug')}
              />
              <button type="submit" disabled={!reply.trim() || !loaded} className="flex h-11 shrink-0 items-center gap-1.5 rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-40">
                <Send aria-hidden className="size-4" /> Balas
              </button>
            </form>
          </article>
        ) : (
          <>
            <nav aria-label="Kanal" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {[{ key: 'semua' as const, label: 'Semua' }, ...CHANNELS].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={channel === item.key}
                  onClick={() => setChannel(item.key)}
                  className={cn('flex h-10 shrink-0 items-center rounded-sm border px-3.5 text-[13.5px] font-medium', channel === item.key ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong')}
                >
                  {item.key === 'semua' ? item.label : `# ${item.label}`}
                </button>
              ))}
            </nav>

            {composing ? (
              <form onSubmit={submitThread} noValidate aria-label="Mulai diskusi" className="pop flex flex-col gap-3 rounded-[18px] border border-brand p-5">
                <label htmlFor="utas-judul" className="text-[13.5px] font-semibold">
                  Judul
                </label>
                <input
                  ref={titleRef}
                  id="utas-judul"
                  value={draft.title}
                  maxLength={TITLE_MAX}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'utas-error' : undefined}
                  onChange={(changeEvent) => setDraft({ ...draft, title: changeEvent.target.value })}
                  placeholder="Tanya panitia, cari tim, atau bagikan materi"
                  className={cn(inputClass, 'h-11')}
                />
                {error && (
                  <span id="utas-error" className="text-[12.5px] font-medium text-danger">
                    {error}
                  </span>
                )}
                <label htmlFor="utas-isi" className="text-[13.5px] font-semibold">
                  Isi <span className="font-normal text-ink-muted">(opsional)</span>
                </label>
                <textarea id="utas-isi" rows={4} maxLength={BODY_MAX} value={draft.body} onChange={(changeEvent) => setDraft({ ...draft, body: changeEvent.target.value })} className={cn(inputClass, 'resize-y py-3')} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[13.5px] font-semibold">Kanal</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {POSTABLE_CHANNELS.map((item) => (
                      <label key={item.key} className="flex h-10 cursor-pointer items-center rounded-sm border border-line px-3 text-[13px] font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                        <input type="radio" name="kanal" value={item.key} checked={draft.channel === item.key} onChange={() => setDraft({ ...draft, channel: item.key })} className="sr-only" />
                        # {item.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-[12.5px] text-ink-muted">Jangan bagikan data pribadi atau nomor rekening di utas publik.</p>
                <div className="flex gap-2">
                  <button type="submit" className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                    Kirim utas
                  </button>
                  <button type="button" onClick={() => { setComposing(false); setError(''); }} className="flex h-11 items-center rounded-card px-4 text-sm font-semibold hover:bg-panel-nested">
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                disabled={!loaded}
                onClick={() => setComposing(true)}
                className="flex min-h-14 items-center gap-3 rounded-[18px] border border-dashed border-line-strong px-4 text-left text-[14.5px] text-ink-muted transition-colors duration-150 hover:border-brand hover:text-ink"
              >
                <Plus aria-hidden className="size-5" /> Mulai diskusi — tanya panitia, cari tim, atau bagikan materi
              </button>
            )}

            <ul className="flex flex-col gap-3">
              {threads.map((thread) => (
                <li key={thread.id} className="enter flex gap-3 rounded-[18px] border border-line p-4 transition-colors duration-150 [animation-duration:500ms] hover:border-line-strong sm:p-5">
                  <button
                    type="button"
                    aria-pressed={state.votes.includes(thread.id)}
                    disabled={!loaded}
                    onClick={() => toggleVote(thread)}
                    className={cn('flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-sm py-1.5 text-[13px] font-semibold', state.votes.includes(thread.id) ? 'bg-brand text-on-brand' : 'bg-panel-nested hover:bg-line')}
                  >
                    <ArrowUp aria-hidden className="size-4" />
                    {votes(thread)}
                    <span className="sr-only"> suara, dukung {thread.title}</span>
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-ink-muted">
                      {thread.pinned && (
                        <span className="inline-flex items-center gap-1 text-ink">
                          <Pin aria-hidden className="size-3" /> Disematkan
                        </span>
                      )}
                      <span># {channelLabel(thread.channel)}</span>
                      {thread.answered && (
                        <span className="inline-flex items-center gap-1 rounded-[5px] bg-brand px-1.5 py-px text-on-brand">
                          <Check aria-hidden className="size-3" /> Dijawab panitia
                        </span>
                      )}
                    </span>
                    <h3 className="text-[16px] font-semibold leading-snug">
                      <button type="button" onClick={() => setOpenThread(thread.id)} className="text-left hover:underline">
                        {thread.title}
                      </button>
                    </h3>
                    {thread.body && <p className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{thread.body}</p>}
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <Author name={thread.author} official={thread.official} time={thread.time} />
                      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                        <MessageSquare aria-hidden className="size-3.5" /> {repliesOf(thread).length} balasan
                      </span>
                    </span>
                  </div>
                </li>
              ))}
              {threads.length === 0 && <li className="rounded-[18px] border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">Belum ada utas di kanal ini. Jadilah yang pertama bertanya.</li>}
            </ul>
            <p className="text-center text-[12px] text-ink-faint">Utas contoh · mode demo. Yang kamu tulis hanya tersimpan di perangkat ini.</p>
          </>
        )}
      </div>

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <span className="pop flex items-center gap-2 rounded-card bg-inverse px-4 py-3 text-sm font-medium text-on-inverse shadow-overlay">
            <Check aria-hidden className="size-4" strokeWidth={2.4} />
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
