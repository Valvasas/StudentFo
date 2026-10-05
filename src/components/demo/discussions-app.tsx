'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Layers,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  PenLine,
  Pin,
  Send,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import { Avatar, AvatarStack, TINT_BG } from '@/components/ui/avatar';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { ChatSketch } from '@/components/ui/feature-illustrations';
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
import { monogramOf } from '@/lib/initials';
import { coverTintOf } from '@/lib/tint';
import { cn } from '@/lib/utils';

export interface GroupEvent {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly organizer: string;
}

const CHANNEL_META: Record<ChannelKey, { icon: LucideIcon; hint: string }> = {
  umum: { icon: MessagesSquare, hint: 'Obrolan bebas seputar kegiatan ini.' },
  info: { icon: Megaphone, hint: 'Hanya panitia.' },
  tanya: { icon: CircleHelp, hint: 'Panitia menjawab langsung di utas.' },
  tim: { icon: UsersRound, hint: 'Cari anggota atau tawarkan dirimu.' },
  materi: { icon: BookOpen, hint: 'Referensi, contoh, dan berkas latihan.' },
};

const channelLabel = (key: ChannelKey) => CHANNELS.find((channel) => channel.key === key)?.label ?? key;
const isChannel = (value: string | null): value is ChannelKey => CHANNELS.some((channel) => channel.key === value);
const inputClass =
  'w-full rounded-[14px] border border-line-strong/70 bg-panel px-4 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Penanda entri riwayat yang ditulis aplikasi ini — "Kembali" boleh memakai history.back() hanya di atasnya. */
const HISTORY_MARK = 'sfInbox';

function ChannelChip({ channel }: { channel: ChannelKey }) {
  const Icon = CHANNEL_META[channel].icon;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-ink-soft">
      <Icon aria-hidden className="size-3.5" /> {channelLabel(channel)}
    </span>
  );
}

function AuthorAvatar({ name, official, size = 'sm' }: { name: string; official?: boolean; size?: 'xs' | 'sm' | 'md' }) {
  // Panitia memakai tinta pekat, bukan tint: akun resmi harus dikenali sebagai
  // satu identitas yang sama di semua grup, bukan "orang" berwarna acak.
  return <Avatar name={name} size={size} className={official ? 'bg-brand text-on-brand' : undefined} />;
}

function AuthorLine({ name, official, time }: { name: string; official?: boolean; time: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-muted">
      <span className="truncate font-semibold text-ink">{name}</span>
      {/* Akun resmi bernama "Panitia" sudah menyebut perannya; lencana di
          sebelahnya hanya mengulang kata yang sama. */}
      {official && name !== 'Panitia' && (
        <span className="inline-flex items-center gap-1 rounded-pill bg-panel-nested px-2 py-px text-[11px] font-semibold text-ink">
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
 *
 * Posisi pembaca hidup di URL (`?grup=`, `?kanal=`, `?utas=`, `?tulis=1`,
 * ADR-054) lewat `history.pushState` — Next.js menyelaraskannya dengan
 * `useSearchParams` tanpa memuat ulang halaman. Akibatnya tombol kembali
 * peramban/ponsel menutup utas atau penulis utas seperti layaknya halaman,
 * dan utas bisa ditautkan. Menulis utas adalah LAYAR sendiri, bukan form
 * yang menyembul di atas daftar.
 */
export function DiscussionsApp({ events, userName }: { events: Readonly<Record<string, GroupEvent>>; userName: string }) {
  const [state, save, loaded] = useDemoStore<DiscussionState>(DISCUSSIONS_KEY, EMPTY_DISCUSSIONS, parseDiscussions);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const groups = [...DEMO_GROUPS, ...DISCOVER_GROUPS.filter((group) => state.joined.includes(group.eventSlug))].filter(
    (group) => events[group.eventSlug],
  );
  const discover = DISCOVER_SLUGS.filter((slug) => events[slug] && !state.joined.includes(slug));
  const [switcher, setSwitcher] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', channel: 'tanya' as ChannelKey });
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const requestedGroup = searchParams.get('grup');
  const requestedChannel = searchParams.get('kanal');
  const openThread = searchParams.get('utas');
  const composing = searchParams.get('tulis') === '1';
  const channel: ChannelKey | 'semua' = isChannel(requestedChannel) ? requestedChannel : 'semua';

  const navigate = useCallback(
    (changes: Record<string, string | null>, mode: 'push' | 'replace' = 'push') => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      // State BARU, jangan salinan `history.state`: salinan membawa kunci internal
      // Next (`__NA`), dan replaceState versi Next lalu menganggapnya panggilan
      // internal — URL berganti tapi `useSearchParams` (dan layarnya) tidak.
      const marked = Boolean((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARK]);
      if (mode === 'push') window.history.pushState({ [HISTORY_MARK]: true }, '', url);
      else window.history.replaceState(marked ? { [HISTORY_MARK]: true } : null, '', url);
      // Layar berganti di tempat: bawa pembaca ke awal layar baru bila ia sudah menggulir jauh.
      const top = topRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) topRef.current?.scrollIntoView({ block: 'start' });
    },
    [pathname, searchParams],
  );

  /** "Kembali" di dalam aplikasi = tombol kembali peramban, selama entri sebelumnya memang milik kita. */
  const goBack = (fallback: Record<string, string | null>) => {
    if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARK]) window.history.back();
    else navigate(fallback, 'replace');
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (composing) titleRef.current?.focus({ preventScroll: true });
  }, [composing]);
  useEffect(() => {
    if (openThread) headingRef.current?.focus({ preventScroll: true });
  }, [openThread]);

  const group: DemoGroup | undefined = groups.find((item) => item.id === requestedGroup) ?? groups[0];
  if (!group) return <p className="text-sm text-ink-muted">Belum ada grup diskusi.</p>;
  const event = events[group.eventSlug]!;
  const allThreads: DemoThread[] = [...(state.threads[group.id] ?? []), ...group.threads];
  const countOf = (key: ChannelKey | 'semua') => (key === 'semua' ? allThreads.length : allThreads.filter((thread) => thread.channel === key).length);
  const threads = allThreads
    .filter((thread) => channel === 'semua' || thread.channel === channel)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
  const current = openThread ? allThreads.find((thread) => thread.id === openThread) : undefined;
  // Utas buatan pengguna baru ada setelah penyimpanan peramban terbaca; jangan
  // jatuh ke daftar dulu lalu melompat ke utasnya.
  const waitingForThread = Boolean(openThread) && !current && !loaded;
  const votes = (thread: DemoThread) => thread.votes + (state.votes.includes(thread.id) ? 1 : 0);
  const repliesOf = (thread: DemoThread) => [...thread.replies, ...(state.replies[thread.id] ?? [])];
  const participants = [...new Map(allThreads.flatMap((thread) => [thread, ...thread.replies]).filter((item) => !item.official).map((item) => [item.author, { name: item.author }])).values()];

  const toggleVote = (thread: DemoThread) =>
    save({ ...state, votes: state.votes.includes(thread.id) ? state.votes.filter((id) => id !== thread.id) : [...state.votes, thread.id] });

  const pickGroup = (id: string) => {
    setSwitcher(false);
    if (id === group.id && !openThread && !composing) return;
    navigate({ grup: id, kanal: null, utas: null, tulis: null });
  };

  const joinGroup = (slug: string) => {
    save({ ...state, joined: [...state.joined, slug] });
    pickGroup(discoverGroupId(slug));
    setToast('Bergabung. Mulai utas pertama di grup ini.');
  };

  const leaveGroup = (slug: string) => {
    save({ ...state, joined: state.joined.filter((item) => item !== slug) });
    navigate({ grup: null, kanal: null, utas: null, tulis: null }, 'replace');
    setToast('Keluar dari grup.');
  };

  const startComposing = (preset?: ChannelKey) => {
    if (preset && preset !== 'info') setDraft((value) => ({ ...value, channel: preset }));
    setError('');
    navigate({ tulis: '1', utas: null });
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
    setError('');
    // Ganti entri "menulis" dengan utas barunya: kembali dari utas = ke daftar, bukan ke form kosong.
    navigate({ tulis: null, utas: thread.id }, 'replace');
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
        <span className="px-2.5 pb-1.5 text-[12.5px] font-semibold uppercase tracking-[.08em] text-ink-muted">Grup kamu</span>
        {groups.map((item) => {
          const info = events[item.eventSlug]!;
          const active = item.id === group.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => pickGroup(item.id)}
              className={cn(
                'flex min-h-16 items-center gap-3 rounded-[18px] border px-2.5 py-2.5 text-left transition-[background-color,border-color] duration-150',
                active ? 'border-line bg-panel shadow-card' : 'border-transparent hover:bg-panel/70',
              )}
            >
              <Avatar name={info.title} label={monogramOf(info.title)} seed={item.id} size="md" shape="square" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('line-clamp-2 text-[13.5px] leading-snug', active ? 'font-semibold' : 'font-medium')}>{info.title}</span>
                <span className="text-[11.5px] text-ink-muted">{item.members.toLocaleString('id-ID')} anggota</span>
              </span>
              {item.fresh > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-highlight px-1.5 text-[11px] font-semibold text-on-highlight">
                  {item.fresh}
                  <span className="sr-only"> utas baru</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Menemukan grup baru adalah tugas sesekali; membacanya di bawah grupmu
          setiap kali membuka halaman hanya menambah daftar yang harus dilewati. */}
      {discover.length > 0 && (
        <details className="group/temukan flex flex-col gap-1 rounded-[18px] border border-dashed border-line-strong p-1.5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2.5 text-[13.5px] font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            Temukan grup lain ({discover.length})
            <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open/temukan:rotate-180" />
          </summary>
          {discover.map((slug) => {
            const info = events[slug]!;
            return (
              <div key={slug} className="pop flex items-center gap-2.5 rounded-[14px] px-2 py-2 hover:bg-panel">
                <Avatar name={info.title} label={monogramOf(info.title)} seed={discoverGroupId(slug)} size="sm" shape="square" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{info.title}</span>
                  <span className="text-[11.5px] text-ink-muted">{info.type}</span>
                </span>
                <button
                  type="button"
                  disabled={!loaded}
                  onClick={() => joinGroup(slug)}
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-pill border border-line-strong/70 bg-panel px-3.5 text-[12.5px] font-semibold transition-colors duration-150 hover:bg-brand hover:text-on-brand"
                >
                  Gabung
                  <span className="sr-only"> grup {info.title}</span>
                </button>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );

  return (
    <div ref={topRef} className="grid scroll-mt-24 gap-8 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-12">
      <aside aria-label="Grup diskusi" className="hidden lg:block">
        <div className="sticky top-[92px]">{groupList}</div>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {/* Pengganti kolom grup di layar sempit. */}
        <div className="lg:hidden">
          <button
            type="button"
            aria-expanded={switcher}
            onClick={() => setSwitcher((value) => !value)}
            className="flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-line bg-panel px-3 text-left"
          >
            <Avatar name={event.title} label={monogramOf(event.title)} seed={group.id} size="sm" shape="square" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11.5px] text-ink-muted">Grup aktif · {groups.length} grup kamu</span>
              <span className="truncate text-sm font-semibold">{event.title}</span>
            </span>
            <span className="text-[13px] font-medium">Ganti</span>
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', switcher && 'rotate-180')} />
          </button>
          {switcher && <div className="pop mt-2 rounded-[20px] border border-line bg-canvas p-3 shadow-overlay">{groupList}</div>}
        </div>

        <header className="overflow-hidden rounded-[26px] border border-line bg-panel">
          <div aria-hidden className={cn('dot-grid h-20 sm:h-24', TINT_BG[coverTintOf(group.id)])} />
          <div className="flex flex-col gap-2.5 px-5 pb-5 sm:px-7 sm:pb-6">
            <div className="-mt-9 flex items-end justify-between gap-3">
              <Avatar name={event.title} label={monogramOf(event.title)} seed={group.id} size="xl" shape="square" ring />
              <Link
                href={`/events/${event.slug}`}
                className="group flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-[13.5px] font-semibold hover:bg-panel-nested"
              >
                Detail kegiatan <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
              </Link>
            </div>
            <span className="mt-1 text-[13px] text-ink-muted">
              {event.type} · {event.organizer}
            </span>
            <h2 className="text-[clamp(22px,3vw,28px)] font-bold leading-tight tracking-[-0.03em]">{event.title}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-muted">
              <span className="flex items-center gap-2">
                {participants.length > 0 && <AvatarStack people={participants} max={4} size="xs" />}
                {group.members.toLocaleString('id-ID')} anggota
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck aria-hidden className="size-4" /> Dimoderasi panitia
              </span>
              {state.joined.includes(group.eventSlug) && (
                <button type="button" onClick={() => leaveGroup(group.eventSlug)} className="flex min-h-11 items-center font-medium underline underline-offset-[3px] hover:text-ink">
                  Keluar grup
                </button>
              )}
            </div>
          </div>
        </header>

        {waitingForThread ? (
          <div aria-hidden className="shimmer h-64 rounded-[26px]" />
        ) : current ? (
          <article aria-labelledby="utas-title" className="fade-in flex flex-col gap-5 rounded-[26px] border border-line bg-panel p-5 sm:p-8">
            <button
              type="button"
              onClick={() => goBack({ utas: null })}
              className="-ml-2 flex min-h-11 items-center gap-1.5 self-start rounded-pill px-3 text-[13.5px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
            >
              <ArrowLeft aria-hidden className="size-4" /> Semua utas
            </button>
            <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="inline-flex h-7 items-center rounded-pill bg-panel-nested px-3">
                <ChannelChip channel={current.channel} />
              </span>
              {current.answered && (
                <span className="inline-flex h-7 items-center gap-1 rounded-pill bg-success-soft px-3 font-semibold text-success">
                  <Check aria-hidden className="size-3.5" /> Dijawab panitia
                </span>
              )}
            </span>
            <h3 id="utas-title" ref={headingRef} tabIndex={-1} className="text-[clamp(22px,3vw,30px)] font-bold leading-tight tracking-[-0.03em] outline-none">
              {current.title}
            </h3>
            <span className="flex items-center gap-2.5">
              <AuthorAvatar name={current.author} official={current.official} />
              <AuthorLine name={current.author} official={current.official} time={current.time} />
            </span>
            {current.body && <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-ink-soft">{current.body}</p>}
            <div className="flex items-center gap-3 border-y border-line py-3">
              <button
                type="button"
                aria-pressed={state.votes.includes(current.id)}
                disabled={!loaded}
                onClick={() => toggleVote(current)}
                className={cn(
                  'flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors duration-150',
                  state.votes.includes(current.id) ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/70 hover:bg-panel-nested',
                )}
              >
                <ArrowUp aria-hidden className="size-4" strokeWidth={2.4} /> {votes(current)}
                <span className="sr-only"> suara, dukung utas ini</span>
              </button>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                <MessageSquare aria-hidden className="size-4" /> {repliesOf(current).length} balasan
              </span>
            </div>
            {repliesOf(current).length > 0 && (
              // Garis linimasa di belakang avatar: balasan terbaca sebagai satu percakapan, bukan kartu lepas.
              <ol className="relative flex flex-col gap-4 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-line">
                {repliesOf(current).map((item, index) => (
                  <li key={`${item.author}-${index}`} className={cn('relative flex gap-3', index >= current.replies.length && 'pop')}>
                    <AuthorAvatar name={item.author} official={item.official} />
                    <div className={cn('flex min-w-0 flex-1 flex-col gap-2 rounded-[18px] rounded-tl-[6px] p-4', item.official ? 'border-[1.5px] border-brand bg-highlight-soft' : 'bg-panel-nested')}>
                      {item.official && (
                        <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[.1em]">
                          <BadgeCheck aria-hidden className="size-3.5" /> JAWABAN PANITIA
                        </span>
                      )}
                      <AuthorLine name={item.author} official={item.official} time={item.time} />
                      <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <form onSubmit={submitReply} className="flex items-end gap-2.5 rounded-[20px] border border-line bg-panel-nested/50 p-2.5">
              <Avatar name={userName} size="sm" className="mb-1 hidden sm:flex" />
              <label htmlFor="balasan" className="sr-only">
                Tulis balasan
              </label>
              <textarea
                id="balasan"
                rows={1}
                maxLength={BODY_MAX}
                value={reply}
                onChange={(changeEvent) => setReply(changeEvent.target.value)}
                placeholder="Tulis balasan…"
                className="max-h-40 min-h-11 flex-1 resize-none rounded-[14px] bg-transparent px-2 py-2.5 text-base leading-snug field-sizing-content"
              />
              <button
                type="submit"
                disabled={!reply.trim() || !loaded}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-pill bg-brand px-4 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover disabled:opacity-40"
              >
                <Send aria-hidden className="size-4" /> Balas
              </button>
            </form>
          </article>
        ) : composing ? (
          <form onSubmit={submitThread} noValidate aria-labelledby="utas-baru" className="fade-in grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_250px]">
            <div className="flex flex-col gap-6 rounded-[26px] border border-line bg-panel p-5 sm:p-8">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => goBack({ tulis: null })}
                  className="-ml-2 mb-2 flex min-h-11 items-center gap-1.5 self-start rounded-pill px-3 text-[13.5px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
                >
                  <ArrowLeft aria-hidden className="size-4" /> Batal
                </button>
                <h3 id="utas-baru" className="text-[clamp(22px,3vw,28px)] font-bold tracking-[-0.03em]">
                  Utas baru
                </h3>
                <p className="text-[14px] text-ink-muted">Dibaca {group.members.toLocaleString('id-ID')} anggota grup ini.</p>
              </div>

              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-2.5 text-[13.5px] font-semibold">Kanal</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {POSTABLE_CHANNELS.map((item) => {
                    const meta = CHANNEL_META[item.key];
                    return (
                      <label
                        key={item.key}
                        className="flex min-h-16 cursor-pointer items-center gap-3 rounded-[16px] border border-line px-3.5 py-3 transition-colors duration-150 hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-panel-nested has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                      >
                        <input type="radio" name="kanal" value={item.key} checked={draft.channel === item.key} onChange={() => setDraft({ ...draft, channel: item.key })} className="sr-only" />
                        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-[12px]', draft.channel === item.key ? 'bg-brand text-on-brand' : 'bg-panel-nested')}>
                          <meta.icon className="size-[18px]" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[14px] font-semibold">{item.label}</span>
                          <span className="text-[12px] leading-snug text-ink-muted">{meta.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="utas-judul" className="text-[13.5px] font-semibold">
                    Judul
                  </label>
                  <span aria-hidden className="font-mono text-[11.5px] text-ink-muted">
                    {draft.title.length}/{TITLE_MAX}
                  </span>
                </div>
                <input
                  ref={titleRef}
                  id="utas-judul"
                  value={draft.title}
                  maxLength={TITLE_MAX}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'utas-error' : undefined}
                  onChange={(changeEvent) => {
                    setDraft({ ...draft, title: changeEvent.target.value });
                    // Pesan galat yang sudah tidak benar lebih membingungkan daripada tidak ada pesan.
                    if (error && changeEvent.target.value.trim().length >= 5) setError('');
                  }}
                  placeholder="Mis. Apakah proposal boleh lebih dari 10 halaman?"
                  className={cn(inputClass, 'h-12', error && 'border-danger')}
                />
                {error && (
                  <span id="utas-error" role="alert" className="text-[12.5px] font-medium text-danger">
                    {error}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="utas-isi" className="text-[13.5px] font-semibold">
                    Isi <span className="font-normal text-ink-muted">(opsional)</span>
                  </label>
                  <span aria-hidden className="font-mono text-[11.5px] text-ink-muted">
                    {draft.body.length}/{BODY_MAX}
                  </span>
                </div>
                <textarea
                  id="utas-isi"
                  rows={6}
                  maxLength={BODY_MAX}
                  value={draft.body}
                  onChange={(changeEvent) => setDraft({ ...draft, body: changeEvent.target.value })}
                  placeholder="Ceritakan konteksnya supaya orang lain bisa langsung menjawab."
                  className={cn(inputClass, 'resize-y py-3 leading-relaxed')}
                />
              </div>
              <p className="flex items-start gap-2 rounded-[14px] bg-panel-nested p-3.5 text-[12.5px] leading-relaxed text-ink-muted">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                Jangan bagikan data pribadi atau nomor rekening di utas publik. Panitia tidak pernah meminta transfer lewat diskusi.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => goBack({ tulis: null })} className="flex h-12 items-center justify-center rounded-pill px-5 text-sm font-semibold text-ink-muted hover:bg-panel-nested hover:text-ink">
                  Batal
                </button>
                <button type="submit" disabled={!loaded} className="flex h-12 items-center justify-center gap-2 rounded-pill bg-brand px-7 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover disabled:opacity-40">
                  <Send aria-hidden className="size-4" /> Kirim utas
                </button>
              </div>
            </div>
            <aside className="hidden flex-col gap-4 xl:flex">
              <IllustrationStage tint="sky" className="px-6 pb-2 pt-6">
                <ChatSketch />
              </IllustrationStage>
              <div className="flex flex-col gap-2 px-1 text-[13px] leading-relaxed text-ink-soft">
                <span className="hand text-[20px] text-ink-muted">biar cepat dijawab</span>
                <span>Satu pertanyaan per utas.</span>
                <span>Cek utas yang disematkan dulu — mungkin sudah dijawab.</span>
                <span>Pilih kanal yang tepat supaya panitia menemukannya.</span>
              </div>
            </aside>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={!loaded}
              onClick={() => startComposing(channel === 'semua' ? undefined : channel)}
              className="group flex min-h-16 w-full items-center gap-3 rounded-[22px] border border-line bg-panel p-2.5 pr-3 text-left transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised disabled:opacity-60"
            >
              <Avatar name={userName} size="md" />
              <span className="min-w-0 flex-1 truncate rounded-pill bg-panel-nested px-4 py-3 text-[14.5px] text-ink-muted">Mulai diskusi — tanya panitia, cari tim, atau bagikan materi</span>
              <span aria-hidden className="hidden h-11 items-center gap-1.5 rounded-pill bg-brand px-4 text-sm font-semibold text-on-brand sm:flex">
                <PenLine className="size-4" /> Tulis
              </span>
            </button>

            <nav aria-label="Kanal" className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {([{ key: 'semua', label: 'Semua' }, ...CHANNELS] as const).map((item) => {
                const on = channel === item.key;
                const Icon = item.key === 'semua' ? Layers : CHANNEL_META[item.key].icon;
                const count = countOf(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => navigate({ kanal: item.key === 'semua' ? null : item.key, utas: null }, 'replace')}
                    className={cn(
                      'flex h-11 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-[13.5px] font-medium transition-colors duration-200 ease-snap',
                      on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel hover:border-line-strong',
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {item.label}
                    <span className={cn('font-mono text-[11px]', on ? 'text-on-brand/70' : 'text-ink-muted')}>{count}</span>
                  </button>
                );
              })}
            </nav>

            {/* Baris tanpa garis pemisah dan tanpa kotak per utas: jeda + latar saat
                disentuh sudah memisahkan. Seluruh baris bisa diklik (judul
                direntangkan); suara duduk di atasnya sebagai aksi sendiri. */}
            {threads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[26px] border border-dashed border-line-strong px-6 py-10 text-center">
                <ChatSketch className="max-w-[220px] text-ink-soft" />
                <p className="font-display text-lg font-semibold">Belum ada utas di kanal ini.</p>
                <p className="max-w-[40ch] text-sm text-ink-muted">Jadilah yang pertama bertanya — pertanyaanmu kemungkinan juga ditanyakan orang lain.</p>
                <button
                  type="button"
                  disabled={!loaded}
                  onClick={() => startComposing(channel === 'semua' ? undefined : channel)}
                  className="mt-1 flex h-11 items-center gap-1.5 rounded-pill bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-hover"
                >
                  <PenLine aria-hidden className="size-4" /> Mulai utas
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {threads.map((thread, index) => (
                  <li
                    key={thread.id}
                    className={cn(
                      'rise group relative flex gap-4 rounded-[22px] border p-4 transition-[background-color,border-color] duration-200 sm:p-5',
                      thread.pinned ? 'border-line bg-panel' : 'border-transparent hover:border-line hover:bg-panel',
                    )}
                    style={{ '--i': index } as CSSProperties}
                  >
                    <span className="hidden sm:block">
                      <AuthorAvatar name={thread.author} official={thread.official} size="md" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                        {thread.pinned && (
                          <span className="inline-flex items-center gap-1 font-semibold text-ink">
                            <Pin aria-hidden className="size-3.5" /> Disematkan
                          </span>
                        )}
                        <ChannelChip channel={thread.channel} />
                        {thread.answered && (
                          <span className="inline-flex items-center gap-1 font-semibold text-success">
                            <Check aria-hidden className="size-3.5" /> Dijawab panitia
                          </span>
                        )}
                      </span>
                      <h3 className="font-display text-[17.5px] font-semibold leading-snug tracking-[-0.015em]">
                        <button
                          type="button"
                          onClick={() => navigate({ utas: thread.id })}
                          className="text-left decoration-2 underline-offset-4 after:absolute after:inset-0 after:rounded-[22px] after:content-[''] group-hover:underline"
                        >
                          {thread.title}
                        </button>
                      </h3>
                      {thread.body && <p className="line-clamp-2 text-[14px] leading-relaxed text-ink-muted">{thread.body}</p>}
                      <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <AuthorLine name={thread.author} official={thread.official} time={thread.time} />
                        <span className="relative z-10 ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            aria-pressed={state.votes.includes(thread.id)}
                            disabled={!loaded}
                            onClick={() => toggleVote(thread)}
                            className={cn(
                              'flex min-h-11 items-center gap-1 rounded-pill px-3 text-[13px] font-semibold transition-colors duration-150',
                              state.votes.includes(thread.id) ? 'bg-highlight-soft text-ink' : 'text-ink-muted hover:bg-panel-nested hover:text-ink',
                            )}
                          >
                            <ArrowUp aria-hidden className="size-4" strokeWidth={state.votes.includes(thread.id) ? 2.8 : 2} />
                            {votes(thread)}
                            <span className="sr-only"> suara, dukung {thread.title}</span>
                          </button>
                          <span className="flex min-h-11 items-center gap-1.5 px-2 text-[13px] text-ink-muted">
                            <MessageSquare aria-hidden className="size-3.5" /> {repliesOf(thread).length}
                            <span className="sr-only"> balasan</span>
                          </span>
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-center text-[12px] text-ink-faint">Utas contoh · mode demo. Yang kamu tulis hanya tersimpan di perangkat ini.</p>
          </>
        )}
      </div>

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <span className="pop flex items-center gap-2 rounded-pill bg-inverse px-5 py-3 text-sm font-medium text-on-inverse shadow-overlay">
            <Check aria-hidden className="size-4" strokeWidth={2.4} />
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
