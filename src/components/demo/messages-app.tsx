'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, BadgeCheck, ChevronRight, FileText, Info, Search, Send, ShieldCheck, X } from 'lucide-react';
import { useDemoStore } from '@/components/demo/use-demo-store';
import { Avatar as InitialsAvatar, type AvatarSize } from '@/components/ui/avatar';
import { ChatSketch } from '@/components/ui/feature-illustrations';
import { DEMO_UNREAD_DEFAULT, DEMO_UNREAD_KEY, readDemoNumber, writeDemoJson } from '@/lib/demo/browser-store';
import {
  CONVERSATION_FILTERS,
  DEMO_CONVERSATIONS,
  MESSAGE_MAX,
  MESSAGES_KEY,
  parseStoredMessages,
  type ConversationFilter,
  type DemoConversation,
  type DemoMessage,
  type StoredMessages,
} from '@/lib/demo/conversations';
import { cn } from '@/lib/utils';

const READ_KEY = 'sf-demo-read';
const parseRead = (raw: unknown): readonly string[] => (Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string').slice(0, 20) : []);
const nowLabel = () => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date());

export interface RelatedEvent {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly closes: string | null;
}

/** Tim & penyelenggara berbentuk kotak (kelompok/lembaga), orang berbentuk lingkaran. Akun resmi bertinta pekat, bukan tint. */
function Avatar({ conversation, size = 'md' }: { conversation: DemoConversation; size?: AvatarSize }) {
  return (
    <InitialsAvatar
      name={conversation.name}
      seed={conversation.id}
      size={size}
      shape={conversation.kind === 'Pribadi' ? 'circle' : 'square'}
      className={conversation.official ? 'bg-brand text-on-brand' : undefined}
    />
  );
}

/**
 * Pesan (kanvas Pesan): daftar percakapan, utas, dan panel info.
 * Mode data contoh saja — lihat lib/demo/conversations.ts. Balasan contoh
 * muncul sekali setelah pesan pertama supaya alur kanvas bisa dicoba, dan
 * ditandai jelas sebagai contoh di kepala utas.
 */
export function MessagesApp({ events }: { events: Readonly<Record<string, RelatedEvent>> }) {
  const [stored, saveStored, loaded] = useDemoStore<StoredMessages>(MESSAGES_KEY, {}, parseStoredMessages);
  const [read, saveRead] = useDemoStore<readonly string[]>(READ_KEY, [], parseRead);
  const [selected, setSelected] = useState(DEMO_CONVERSATIONS[0]!.id);
  const [pane, setPane] = useState<'list' | 'chat'>('list');
  const [filter, setFilter] = useState<ConversationFilter>('Semua');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [info, setInfo] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const current = DEMO_CONVERSATIONS.find((item) => item.id === selected) ?? DEMO_CONVERSATIONS[0]!;
  const messagesOf = (conversation: DemoConversation): readonly DemoMessage[] => [...conversation.messages, ...(stored[conversation.id] ?? [])];
  const unreadOf = (conversation: DemoConversation) => (read.includes(conversation.id) ? 0 : conversation.unread);
  const thread = messagesOf(current);
  const event = current.eventSlug ? events[current.eventSlug] : undefined;

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return DEMO_CONVERSATIONS.filter(
      (item) =>
        (filter === 'Semua' || (filter === 'Belum dibaca' ? unreadOf(item) > 0 : item.kind === filter)) &&
        (!needle || `${item.name} ${item.sub}`.toLowerCase().includes(needle)),
    );
    // unreadOf bergantung pada `read`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, read]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, selected, typing]);

  const open = (conversation: DemoConversation) => {
    setSelected(conversation.id);
    setPane('chat');
    setDraft('');
    setTyping(null);
    if (!read.includes(conversation.id) && conversation.unread > 0) {
      saveRead([...read, conversation.id]);
      // Lencana di navbar membaca angka yang sama (DEMO_UNREAD_KEY).
      writeDemoJson(DEMO_UNREAD_KEY, Math.max(0, readDemoNumber(DEMO_UNREAD_KEY, DEMO_UNREAD_DEFAULT) - conversation.unread));
    }
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const send = (text: string) => {
    const body = text.trim().slice(0, MESSAGE_MAX);
    if (!body) return;
    const mine = stored[current.id] ?? [];
    const firstFromMe = !mine.some((message) => message.from === 'me');
    const next = [...mine, { from: 'me', time: nowLabel(), text: body }];
    saveStored({ ...stored, [current.id]: next });
    setDraft('');
    if (firstFromMe) {
      const conversation = current;
      setTyping(conversation.reply.from);
      window.setTimeout(() => {
        setTyping(null);
        let latest: StoredMessages = {};
        try {
          latest = parseStoredMessages(JSON.parse(window.localStorage.getItem(MESSAGES_KEY) ?? '{}'));
        } catch {
          // Penyimpanan diblokir: balasan tetap ditambahkan ke yang ada di layar.
          latest = { ...stored, [conversation.id]: next };
        }
        saveStored({ ...latest, [conversation.id]: [...(latest[conversation.id] ?? []), { ...conversation.reply, time: nowLabel() }] });
      }, 1600);
    }
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  };

  return (
    <div className="enter grid h-[clamp(540px,calc(100dvh-280px),780px)] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[26px] border border-line bg-panel shadow-card [animation-delay:100ms] md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Daftar percakapan */}
      <section aria-label="Daftar percakapan" className={cn('min-h-0 flex-col border-line md:flex md:border-r', pane === 'list' ? 'flex' : 'hidden')}>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <label className="relative flex items-center">
            <span className="sr-only">Cari percakapan</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau tim"
              className="h-11 w-full rounded-pill border border-transparent bg-panel-nested pl-10 pr-4 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </label>
          <div role="group" aria-label="Saring percakapan" className="relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {CONVERSATION_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                className={cn(
                  'flex h-9 shrink-0 items-center rounded-pill px-3.5 text-[13px] font-medium transition-colors duration-200 ease-snap',
                  filter === item ? 'bg-brand text-on-brand' : 'border border-line text-ink-soft hover:border-line-strong hover:text-ink',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.map((conversation) => {
            const last = messagesOf(conversation).at(-1);
            const unread = unreadOf(conversation);
            const active = conversation.id === current.id;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => open(conversation)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-line/70 px-4 py-3.5 text-left transition-colors duration-150',
                    active ? 'bg-panel-nested shadow-[inset_3px_0_0_var(--color-text-primary)]' : 'hover:bg-panel-nested/60',
                  )}
                >
                  <Avatar conversation={conversation} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className={cn('flex min-w-0 items-center gap-1 truncate text-[14.5px]', unread ? 'font-bold' : 'font-semibold')}>
                        <span className="truncate">{conversation.name}</span>
                        {conversation.official && <BadgeCheck aria-label="terverifikasi" className="size-3.5 shrink-0" />}
                      </span>
                      <span className="ml-auto shrink-0 text-[11.5px] text-ink-muted">{(stored[conversation.id] ?? []).length ? 'Baru' : conversation.time}</span>
                    </span>
                    <span className={cn('flex items-center gap-2 text-[13px]', unread ? 'text-ink' : 'text-ink-muted')}>
                      <span className="truncate">
                        {last?.from === 'me' ? 'Kamu: ' : ''}
                        {last?.file ? 'mengirim berkas' : last?.text}
                      </span>
                      {unread > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-highlight px-1.5 text-[11px] font-semibold text-on-highlight">
                          {unread}
                          <span className="sr-only"> belum dibaca</span>
                        </span>
                      )}
                    </span>
                    <span className="text-[11.5px] text-ink-faint">{conversation.kind}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <ChatSketch className="max-w-[160px] text-ink-soft" />
              <span className="text-sm font-semibold">Tidak ada percakapan yang cocok.</span>
              <span className="text-[12.5px] text-ink-muted">Coba nama lain, atau pilih saringan &ldquo;Semua&rdquo;.</span>
            </li>
          )}
        </ul>
      </section>

      {/* Utas */}
      <section aria-label={`Percakapan dengan ${current.name}`} className={cn('min-h-0 min-w-0 flex-col md:flex', pane === 'chat' ? 'flex' : 'hidden')}>
        <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
          <button type="button" onClick={() => setPane('list')} className="flex size-11 shrink-0 items-center justify-center rounded-pill hover:bg-panel-nested md:hidden">
            <ArrowLeft aria-hidden className="size-5" />
            <span className="sr-only">Kembali ke daftar percakapan</span>
          </button>
          <Avatar conversation={current} size="md" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1 truncate text-[15px] font-semibold">
              {current.name}
              {current.official && <BadgeCheck aria-label="terverifikasi" className="size-4 shrink-0" />}
            </span>
            <span className="truncate text-[12.5px] text-ink-muted">{current.sub}</span>
          </span>
          <Dialog.Root open={info} onOpenChange={setInfo}>
            <Dialog.Trigger className={cn('flex size-11 shrink-0 items-center justify-center rounded-pill hover:bg-panel-nested', info && 'bg-panel-nested')}>
              <Info aria-hidden className="size-5" />
              <span className="sr-only">Info percakapan</span>
            </Dialog.Trigger>
            <InfoSheet conversation={current} event={event} />
          </Dialog.Root>
        </header>

        {/* tabIndex: wilayah gulir harus bisa dicapai & digulir dengan keyboard (WCAG 2.1.1). */}
        <div
          ref={threadRef}
          tabIndex={0}
          role="log"
          aria-label={`Pesan dengan ${current.name}`}
          className="dot-grid flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto bg-panel-nested/40 px-4 py-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:px-6"
        >
          {current.official && (
            <p className="mx-auto mb-3 flex max-w-[460px] items-start gap-2 rounded-[16px] border border-line bg-panel px-4 py-3 text-[12.5px] leading-snug text-ink-soft">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              Percakapan contoh dari penyelenggara. StudentFo tidak pernah meminta transfer ke rekening pribadi.
            </p>
          )}
          <p className="mb-2 self-center rounded-pill border border-line bg-panel px-3.5 py-1 text-[11.5px] font-medium text-ink-muted">Contoh percakapan · mode demo</p>
          {thread.map((message, index) => {
            const mine = message.from === 'me';
            const previous = thread[index - 1];
            const grouped = previous?.from === message.from;
            return (
              <div
                key={`${index}-${message.time}`}
                // Pesan yang baru masuk (ketikanmu & balasan contoh) muncul dari bawah; riwayat awal tidak ikut beranimasi.
                className={cn('flex max-w-[78%] flex-col gap-1', mine ? 'items-end self-end' : 'items-start self-start', !grouped && 'mt-3', index >= current.messages.length && 'pop')}
              >
                {!mine && !grouped && current.kind !== 'Pribadi' && <span className="px-1 text-[12px] font-semibold text-ink-muted">{message.from}</span>}
                {message.file ? (
                  <span className="flex items-center gap-3 rounded-[18px] border border-line bg-panel px-3.5 py-3 shadow-card">
                    <span aria-hidden className="flex size-10 items-center justify-center rounded-[12px] bg-tint-peach">
                      <FileText className="size-5" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{message.text}</span>
                      <span className="text-xs text-ink-muted">{message.file.size} · contoh berkas</span>
                    </span>
                  </span>
                ) : (
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[14.5px] leading-snug',
                      mine ? 'rounded-br-[6px] bg-brand text-on-brand' : 'rounded-bl-[6px] border border-line bg-panel shadow-card',
                    )}
                  >
                    {message.text}
                  </p>
                )}
                <span className="px-1 text-[11px] text-ink-faint">{message.time}</span>
              </div>
            );
          })}
          {typing && (
            <p className="pop mt-3 flex items-center gap-2 self-start text-[12.5px] text-ink-muted">
              <span aria-hidden className="flex gap-1 rounded-[18px] rounded-bl-[6px] border border-line bg-panel px-3.5 py-3">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="typing-dot size-1.5 rounded-full bg-ink-muted" style={{ '--d': `${dot * 160}ms` } as React.CSSProperties} />
                ))}
              </span>
              {typing} sedang mengetik…
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-line p-3 sm:p-4">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {current.quick.map((text) => (
              <button
                key={text}
                type="button"
                disabled={!loaded}
                onClick={() => send(text)}
                className="flex h-9 shrink-0 items-center rounded-pill border border-line-strong/70 bg-panel px-3.5 text-[13px] font-medium transition-colors duration-150 hover:bg-brand hover:text-on-brand"
              >
                {text}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 rounded-[24px] border border-line-strong/70 bg-panel p-1.5 pl-2 transition-colors duration-150 focus-within:border-brand"
          >
            <label htmlFor="composer" className="sr-only">
              Tulis pesan ke {current.name}
            </label>
            <textarea
              ref={inputRef}
              id="composer"
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKey}
              placeholder="Tulis pesan…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-[18px] bg-transparent px-2.5 py-2.5 text-base leading-snug field-sizing-content"
            />
            <button
              type="submit"
              disabled={!draft.trim() || !loaded}
              className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-brand text-on-brand transition-[opacity,background-color] duration-150 hover:bg-brand-hover disabled:opacity-40"
            >
              <Send aria-hidden className="size-4" />
              <span className="sr-only">Kirim</span>
            </button>
          </form>
          <p className="text-[11.5px] text-ink-faint">Enter untuk kirim, Shift+Enter untuk baris baru. Pesan demo hanya tersimpan di perangkat ini.</p>
        </div>
      </section>
    </div>
  );
}

/**
 * Info percakapan sebagai dialog lembar-samping (Radix): fokus pindah ke
 * dalamnya dan terkunci di sana, Esc / klik latar menutup, fokus kembali ke
 * tombol info. Versi sebelumnya `<aside fixed>` tanpa latar — pembaca layar
 * dan papan ketik bisa tersesat ke percakapan di belakangnya.
 */
function InfoSheet({ conversation, event }: { conversation: DemoConversation; event: RelatedEvent | undefined }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fade-in fixed inset-0 z-50 bg-[rgb(29_27_23/0.32)]" />
      <Dialog.Content
        aria-describedby={undefined}
        className="sheet-in fixed inset-y-0 right-0 z-50 flex w-[min(360px,100vw)] flex-col gap-6 overflow-y-auto border-l border-line bg-panel p-6 shadow-overlay focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <Dialog.Title className="text-base font-semibold">Info percakapan</Dialog.Title>
          <Dialog.Close className="flex size-11 items-center justify-center rounded-pill hover:bg-panel-nested">
            <X aria-hidden className="size-5" />
            <span className="sr-only">Tutup info</span>
          </Dialog.Close>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar conversation={conversation} size="xl" />
          <span className="mt-1 flex items-center gap-1 text-[17px] font-semibold">
            {conversation.name}
            {conversation.official && <BadgeCheck aria-label="terverifikasi" className="size-4" />}
          </span>
          <span className="text-[13px] text-ink-muted">
            {conversation.kind} · {conversation.sub}
          </span>
        </div>
        {event && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] tracking-[.08em] text-ink-muted">KEGIATAN TERKAIT</span>
            <div className="flex flex-col gap-1 rounded-[16px] bg-panel-nested p-4">
              <span className="text-[12px] text-ink-muted">{event.type}</span>
              <span className="text-sm font-semibold leading-snug">{event.title}</span>
              {event.closes && <span className="text-[12.5px] text-ink-muted">Tutup {event.closes}</span>}
            </div>
            <Link href={`/events/${event.slug}`} className="flex min-h-11 items-center justify-between border-b border-line text-sm font-medium hover:underline">
              Detail kegiatan <ChevronRight aria-hidden className="size-4" />
            </Link>
            <Link href="/discussions" className="flex min-h-11 items-center justify-between border-b border-line text-sm font-medium hover:underline">
              Ruang diskusi <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
        )}
        {conversation.members && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] tracking-[.08em] text-ink-muted">ANGGOTA</span>
            <ul className="flex flex-col">
              {[...conversation.members, ['Kamu', 'Anggota'] as const].map(([name, role]) => (
                <li key={name} className="flex items-center gap-3 py-2">
                  <InitialsAvatar name={name} size="sm" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-[12px] text-ink-muted">{role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
