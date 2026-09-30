import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Heart, Search, ShieldCheck, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { NetworkGraphView } from '@/components/network/network-graph';
import { HiddenProfileBanner, NetworkSettings } from '@/components/network/network-settings';
import { BlockedRow, ConnectionRow, IncomingRequestCard, OutgoingRow, SuggestionCard } from '@/components/network/person-cards';
import { SelectInput } from '@/components/ui/field';
import { getSessionUser, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { EventRepository } from '@/lib/data/repository';
import { decodeConnectionCursor, NETWORK_LIMITS, normalizeConnectionSearch, suggestionReasons } from '@/lib/network';
import { buildNetworkGraph, buildPreviewGraph } from '@/lib/network-graph';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { Category, ConnectionCounts, NetworkEventRef } from '@/types/domain';

/**
 * Koneksi (ADR-040, dipecah per tugas di ADR-048).
 *
 * Satu halaman dulu memuat ajakan, pencarian + 12 chip minat, 24 kartu
 * saran, daftar koneksi, ajakan terkirim, form pengaturan, peta, dan daftar
 * blokir sekaligus. Setiap daftar tumbuh bersama jaringan pemakainya, jadi
 * halaman itu memanjang tanpa batas (sudah 6.500px di ponsel dengan data
 * contoh). Sekarang satu tab = satu tugas, pola yang dikenal dari jejaring
 * profesional: "Untukmu" (tindakan hari ini), "Koneksimu" (cari & kelola),
 * "Ajakan", "Peta", "Pengaturan". Setiap daftar dipaginasi dengan kursor
 * keyset sendiri dan dicari di server — panjang halaman tidak lagi
 * bergantung pada ukuran jaringan.
 *
 * Tab, pencarian, dan halaman berikutnya semuanya URL (`?tab=`, `<form
 * method="get">`, `?setelah=`), jadi tetap jalan tanpa JavaScript
 * (AGENTS.md §9). Setiap tab hanya mengambil data yang ia tampilkan.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Koneksi',
  description: 'Temukan pelajar & mahasiswa dengan minat yang sama, lihat peta jaringanmu, dan bangun tim untuk lomba berikutnya.',
};

const TABS = [
  { key: 'untukmu', label: 'Untukmu' },
  { key: 'koneksi', label: 'Koneksimu' },
  { key: 'ajakan', label: 'Ajakan' },
  { key: 'peta', label: 'Peta' },
  { key: 'pengaturan', label: 'Pengaturan' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Sekilas di "Untukmu"; sisanya satu klik ke tab/halaman lengkapnya. */
const INCOMING_PREVIEW = 3;
const SUGGESTION_PREVIEW = 6;
const LIST_PAGE_SIZE = 30;
const INCOMING_PAGE_SIZE = 12;
/** Peta menggambar paling banyak segini sambungan; sisanya disebut di keterangan peta. */
const GRAPH_CONNECTION_LIMIT = 100;
const VIEWER_EVENT_LIMIT = 50;
const TEAM_LINK_LIMIT = 400;

type CategoryName = (slug: string) => string;

interface TabContext {
  readonly user: AuthUser;
  readonly repository: EventRepository;
  readonly params: RawSearchParams;
  readonly categories: readonly Category[];
  readonly categoryName: CategoryName;
  readonly counts: ConnectionCounts;
  readonly now: Date;
}

function tabHref(tab: TabKey, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...(tab === 'untukmu' ? {} : { tab }), ...extra }).toString();
  return query ? `/connections?${query}` : '/connections';
}

/** Kursor dari URL: rusak = mulai dari halaman pertama, bukan halaman error. */
function cursorParam(params: RawSearchParams): string | null {
  const raw = firstParam(params.setelah);
  return raw && decodeConnectionCursor(raw) ? raw : null;
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);
  const categories = await repository.listCategories();

  if (!user) return <GuestConnections categories={categories} />;

  const requested = firstParam(params.tab);
  const tab: TabKey = TABS.find((item) => item.key === requested)?.key ?? 'untukmu';
  const counts = await repository.countConnections(user.id);
  const context: TabContext = {
    user,
    repository,
    params,
    categories,
    categoryName: (slug) => categories.find((category) => category.slug === slug)?.name ?? slug,
    counts,
    now: new Date(),
  };

  return (
    <div className="container-page pb-20 pt-10">
      <header className="enter flex flex-col gap-2 [animation-duration:900ms]">
        <h1 className="text-[clamp(32px,4.5vw,44px)] leading-[1.05]">Koneksi</h1>
        <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-ink-muted">
          Temukan orang dengan minat yang sama, lalu ajak mereka satu tim.
        </p>
      </header>

      <nav aria-label="Bagian koneksi" className="-mx-4 mt-8 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1">
          {TABS.map((item) => {
            const on = item.key === tab;
            const count = item.key === 'koneksi' ? counts.accepted : item.key === 'ajakan' ? counts.incoming : null;
            return (
              <li key={item.key}>
                <Link
                  href={tabHref(item.key)}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex h-12 items-center gap-2 whitespace-nowrap px-3 text-[15px] transition-colors duration-150',
                    on ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                  {count !== null && count > 0 && (
                    // Ajakan masuk menunggu jawaban pembaca → satu-satunya angka yang ditonjolkan.
                    <span
                      className={cn(
                        'flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11px] font-semibold',
                        item.key === 'ajakan' ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-soft',
                      )}
                    >
                      {count}
                      <span className="sr-only">{item.key === 'ajakan' ? ' ajakan menunggu jawaban' : ' koneksi'}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ActionFeedback params={params} className="mt-6 max-w-2xl" />

      <div className="mt-8">
        {tab === 'untukmu' && <ForYouTab {...context} />}
        {tab === 'koneksi' && <ConnectionsTab {...context} />}
        {tab === 'ajakan' && <InvitationsTab {...context} />}
        {tab === 'peta' && <MapTab {...context} />}
        {tab === 'pengaturan' && <SettingsTab {...context} />}
      </div>
    </div>
  );
}

async function viewerEventsOf(repository: EventRepository, userId: string): Promise<NetworkEventRef[]> {
  const items = await repository.listTrackerItems(userId);
  return items
    .slice(0, VIEWER_EVENT_LIMIT)
    .map(({ event }) => ({ id: event.id, slug: event.slug, title: event.title, eventType: event.eventType }));
}

/**
 * Tindakan hari ini, urut dari yang membuat orang lain menunggu: ajakan
 * masuk (sekilas), lalu saran. Hanya 6 saran sampai pembaca meminta lebih
 * atau menyaring — daftar 24 kartu di layar pertama adalah alasan utama
 * halaman lama terasa menekan.
 */
async function ForYouTab({ user, repository, params, categories, categoryName, counts, now }: TabContext) {
  const search = (firstParam(params.q) ?? '').slice(0, 80);
  const rawInterest = firstParam(params.minat) ?? null;
  const interest = categories.some((category) => category.slug === rawInterest) ? rawInterest : null;
  const filtered = Boolean(search || interest);
  const expanded = filtered || firstParam(params.lagi) === '1';
  const filters = { ...(search ? { q: search } : {}), ...(interest ? { minat: interest } : {}) };
  const returnTo = tabHref('untukmu', { ...filters, ...(expanded && !filtered ? { lagi: '1' } : {}) });

  const [profile, incomingPage, viewerEvents] = await Promise.all([
    repository.getNetworkProfile(user.id),
    counts.incoming > 0 ? repository.listConnections(user.id, { limit: INCOMING_PREVIEW, cursor: null, kind: 'incoming' }) : null,
    viewerEventsOf(repository, user.id),
  ]);
  const suggestions = await repository.suggestPeople(user, { search, interest, limit: NETWORK_LIMITS.suggestionLimit, viewerEvents });
  const shown = expanded ? suggestions : suggestions.slice(0, SUGGESTION_PREVIEW);
  const incoming = incomingPage?.items ?? [];
  const mine = categories.filter((category) => user.interests.includes(category.slug));
  const others = categories.filter((category) => !user.interests.includes(category.slug));

  return (
    <div className="flex flex-col gap-14">
      {!profile.discoverable && <HiddenProfileBanner />}

      {incoming.length > 0 && (
        <section aria-labelledby="ajakan-masuk" className="flex flex-col gap-4">
          <SectionTitle
            id="ajakan-masuk"
            title="Menunggu jawabanmu"
            count={counts.incoming}
            action={counts.incoming > incoming.length ? { href: tabHref('ajakan'), label: `Lihat semua ${counts.incoming}` } : undefined}
          />
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
            {incoming.map((connection) => (
              <li key={connection.id}>
                <IncomingRequestCard connection={connection} categoryName={categoryName} viewerInterests={user.interests} returnTo={returnTo} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cari-koneksi" className="flex flex-col gap-5">
        <SectionTitle id="cari-koneksi" title={filtered ? 'Hasil pencarian' : 'Orang yang mungkin cocok denganmu'} />

        {/* Satu baris: kata kunci + minat + tombol. Dua belas chip minat yang
            dulu berjejer di sini bersaing dengan hasil yang dicari. */}
        <form method="get" action="/connections" role="search" className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex flex-1 items-center">
            <span className="sr-only">Cari nama, jurusan, atau keahlian</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-ink-muted" />
            <input
              type="search"
              name="q"
              defaultValue={search}
              maxLength={80}
              placeholder="Nama, jurusan, atau keahlian…"
              className="h-11 w-full rounded-card border border-line-strong/70 bg-panel pl-10 pr-3.5 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Saring minat</span>
            <SelectInput name="minat" defaultValue={interest ?? ''}>
              <option value="">Semua minat</option>
              {mine.length > 0 && (
                <optgroup label="Minatmu">
                  {mine.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={mine.length > 0 ? 'Lainnya' : 'Minat'}>
                {others.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            </SelectInput>
          </label>
          <button type="submit" className="flex h-11 items-center justify-center rounded-card bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-hover">
            Cari
          </button>
        </form>
        {filtered && (
          <Link href="/connections" className="-mt-2 flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-ink-muted hover:text-ink">
            <X aria-hidden className="size-3.5" /> Hapus saringan
          </Link>
        )}

        {suggestions.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[18px] border border-dashed border-line-strong p-6">
            <p className="text-[15px] font-semibold">{filtered ? 'Belum ada yang cocok dengan saringan ini.' : 'Belum ada saran untukmu saat ini.'}</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              {filtered
                ? 'Coba kata kunci lain, atau pilih minat yang lebih umum.'
                : 'Saran hanya berisi orang yang memilih bisa ditemukan. Cek lagi nanti, atau buka tim di Cari Tim agar orang yang cocok datang padamu.'}
            </p>
            {!filtered && (
              <Link href="/teams" className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-[3px]">
                <Users aria-hidden className="size-4" /> Buka Cari Tim
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
              {shown.map((suggestion) => (
                <li key={suggestion.person.userId}>
                  <SuggestionCard
                    person={suggestion.person}
                    reasons={suggestionReasons(suggestion, categoryName)}
                    viewerInterests={user.interests}
                    categoryName={categoryName}
                    returnTo={returnTo}
                  />
                </li>
              ))}
            </ul>
            {shown.length < suggestions.length && (
              <Link
                href={`${tabHref('untukmu', { lagi: '1' })}#cari-koneksi`}
                className="flex min-h-11 items-center gap-1.5 self-center rounded-card border border-line-strong/70 px-5 text-sm font-semibold transition-colors duration-150 hover:bg-panel-nested"
              >
                Tampilkan {suggestions.length - shown.length} saran lainnya
              </Link>
            )}
          </>
        )}
      </section>

      {counts.accepted === 0 && counts.incoming === 0 && user.interests.length === 0 && (
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-muted">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
          Saran di atas lebih nyambung kalau kamu mengisi peminatan.
          <Link href="/profile/interests" className="shrink-0 font-semibold text-ink underline underline-offset-[3px]">
            Isi peminatan
          </Link>
        </p>
      )}
    </div>
  );
}

/** Daftar koneksi yang bisa dicari & dipaginasi — cara yang bekerja di 10 maupun 10.000 koneksi. */
async function ConnectionsTab({ user, repository, params, counts, now }: TabContext) {
  const search = normalizeConnectionSearch(firstParam(params.cari));
  const cursor = cursorParam(params);
  const base = { ...(search ? { cari: search } : {}) };
  const returnTo = tabHref('koneksi', { ...base, ...(cursor ? { setelah: cursor } : {}) });
  const page = counts.accepted > 0 ? await repository.listConnections(user.id, { limit: LIST_PAGE_SIZE, cursor, kind: 'accepted', search }) : null;
  const items = page?.items ?? [];

  return (
    <section aria-labelledby="koneksimu" className="flex max-w-3xl flex-col gap-5">
      <h2 id="koneksimu" className="sr-only">
        Koneksimu {counts.accepted}
      </h2>
      {counts.accepted === 0 ? (
        <EmptyNote
          title="Belum ada koneksi"
          body="Orang yang menerima ajakanmu, atau yang ajakannya kamu terima, akan muncul di sini."
          action={{ href: '/connections', label: 'Lihat saran untukmu' }}
        />
      ) : (
        <>
          <form method="get" action="/connections" role="search" className="flex gap-2">
            <input type="hidden" name="tab" value="koneksi" />
            <label className="relative flex flex-1 items-center">
              <span className="sr-only">Cari di antara koneksimu</span>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-ink-muted" />
              <input
                type="search"
                name="cari"
                defaultValue={search}
                maxLength={60}
                placeholder={`Cari di antara ${counts.accepted} koneksi…`}
                className="h-11 w-full rounded-card border border-line-strong/70 bg-panel pl-10 pr-3.5 text-base transition-colors duration-150 hover:border-line-strong focus-visible:border-brand"
              />
            </label>
            <button type="submit" className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
              Cari
            </button>
          </form>

          {items.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {search ? <>Tidak ada koneksi bernama &ldquo;{search}&rdquo;.</> : 'Tidak ada koneksi lagi di halaman ini.'}{' '}
              <Link href={tabHref('koneksi')} className="font-medium text-ink underline underline-offset-[3px]">
                Tampilkan semua
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line px-5">
              {items.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} returnTo={returnTo} now={now} />
              ))}
            </ul>
          )}
          <Pager
            first={cursor ? tabHref('koneksi', base) : null}
            next={page?.nextCursor ? tabHref('koneksi', { ...base, setelah: page.nextCursor }) : null}
            label="koneksi"
          />
        </>
      )}
    </section>
  );
}

async function InvitationsTab({ user, repository, params, categoryName, counts, now }: TabContext) {
  const direction = firstParam(params.arah) === 'terkirim' ? 'terkirim' : 'masuk';
  const cursor = cursorParam(params);
  const base = { arah: direction };
  const returnTo = tabHref('ajakan', { ...base, ...(cursor ? { setelah: cursor } : {}) });
  const page = await repository.listConnections(user.id, {
    limit: direction === 'masuk' ? INCOMING_PAGE_SIZE : LIST_PAGE_SIZE,
    cursor,
    kind: direction === 'masuk' ? 'incoming' : 'outgoing',
  });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Arah ajakan" className="flex gap-1.5">
        {(
          [
            ['masuk', 'Masuk', counts.incoming],
            ['terkirim', 'Terkirim', counts.outgoing],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={tabHref('ajakan', { arah: key })}
            aria-current={direction === key ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-sm border px-4 text-[13.5px] font-medium transition-colors duration-150',
              direction === key ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong',
            )}
          >
            {label}
            <span className={cn('font-mono text-xs', direction === key ? 'text-on-brand/70' : 'text-ink-muted')}>{count}</span>
          </Link>
        ))}
      </nav>

      {direction === 'masuk' ? (
        <section aria-labelledby="ajakan-masuk" className="flex flex-col gap-4">
          <h2 id="ajakan-masuk" className="sr-only">
            Ajakan masuk
          </h2>
          {page.items.length === 0 ? (
            <EmptyNote title="Tidak ada ajakan yang menunggu" body="Ajakan baru juga muncul di lonceng notifikasi." />
          ) : (
            <>
              <p className="text-[13.5px] text-ink-muted">Terima atau tolak — pengirim tidak diberi tahu alasannya.</p>
              <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
                {page.items.map((connection) => (
                  <li key={connection.id}>
                    <IncomingRequestCard connection={connection} categoryName={categoryName} viewerInterests={user.interests} returnTo={returnTo} now={now} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section aria-labelledby="terkirim" className="flex max-w-3xl flex-col gap-4">
          <h2 id="terkirim" className="sr-only">
            Ajakan terkirim
          </h2>
          {page.items.length === 0 ? (
            <EmptyNote title="Tidak ada ajakan yang menunggu jawaban" body="Ajakan yang kamu kirim muncul di sini sampai diterima atau ditolak." />
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line px-5">
              {page.items.map((connection) => (
                <OutgoingRow key={connection.id} connection={connection} returnTo={returnTo} now={now} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Pager
        first={cursor ? tabHref('ajakan', base) : null}
        next={page.nextCursor ? tabHref('ajakan', { ...base, setelah: page.nextCursor }) : null}
        label="ajakan"
      />
    </div>
  );
}

/** Peta = eksplorasi, bukan tindakan: di tab sendiri, dan hanya di sini datanya diambil. */
async function MapTab({ user, repository, categories, counts }: TabContext) {
  const viewerEvents = await viewerEventsOf(repository, user.id);
  const [connectionPage, suggestions] = await Promise.all([
    repository.listConnections(user.id, { limit: GRAPH_CONNECTION_LIMIT, cursor: null }),
    repository.suggestPeople(user, { search: '', interest: null, limit: NETWORK_LIMITS.suggestionLimit, viewerEvents }),
  ]);
  const connections = connectionPage.items;
  const teamLinks = await repository.listTeamLinks(
    [user.id, ...connections.map((connection) => connection.person.userId), ...suggestions.map((item) => item.person.userId)],
    TEAM_LINK_LIMIT,
  );
  const graph = buildNetworkGraph({ viewer: user, connections, suggestions, categories, viewerEvents, teamLinks });
  const summary = [
    `${counts.accepted} koneksi`,
    `${counts.incoming} ajakan masuk`,
    `${counts.outgoing} ajakan terkirim`,
    `${suggestions.length} saran`,
  ].join(', ');
  const returnTo = tabHref('peta');

  return (
    <section aria-labelledby="peta-koneksi" className="flex flex-col gap-4">
      <SectionTitle
        id="peta-koneksi"
        title="Peta koneksi"
        hint={graph.hiddenPeople > 0 ? `${graph.hiddenPeople} orang tidak digambar agar peta tetap terbaca` : 'Garis = sambungan · simpul besar = banyak sambungan'}
      />
      <NetworkGraphView graph={graph} returnTo={returnTo} summary={summary} />
      {counts.accepted === 0 && counts.incoming === 0 && (
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-muted">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
          Petamu masih berisi kamu dan minatmu. Ajak satu orang dari tab Untukmu — peta langsung tumbuh.
        </p>
      )}
    </section>
  );
}

async function SettingsTab({ user, repository, categoryName, now }: TabContext) {
  const [profile, blocked] = await Promise.all([repository.getNetworkProfile(user.id), repository.listBlockedPeople(user.id)]);
  const returnTo = tabHref('pengaturan');

  return (
    <div className="flex max-w-3xl flex-col gap-14">
      <NetworkSettings viewer={user} profile={profile} categoryName={categoryName} returnTo={returnTo} />

      <section id="diblokir" aria-labelledby="diblokir-title" className="flex scroll-mt-28 flex-col gap-4">
        <SectionTitle id="diblokir-title" title="Diblokir" count={blocked.length} hint="Mereka tidak bisa menemukan atau mengajakmu, dan tidak diberi tahu" />
        {blocked.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            Belum ada. Blokir lewat menu opsi di daftar koneksi, kartu ajakan, atau panel peta.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line px-5">
            {blocked.map((person) => (
              <BlockedRow key={person.userId} person={person} returnTo={returnTo} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionTitle({
  id,
  title,
  count,
  hint,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  hint?: string;
  action?: { href: string; label: string } | undefined;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="text-[22px] font-bold tracking-[-0.025em]">
        {title}
      </h2>
      {count !== undefined && <span className="font-mono text-[13px] text-ink-muted">{count}</span>}
      {hint && <span className="text-[13px] text-ink-muted sm:ml-auto">{hint}</span>}
      {action && (
        <Link href={action.href} className="flex min-h-11 items-center gap-1 text-sm font-semibold underline underline-offset-[3px] sm:ml-auto">
          {action.label} <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Pager({ first, next, label }: { first: string | null; next: string | null; label: string }) {
  if (!first && !next) return null;
  return (
    <nav aria-label={`Halaman ${label}`} className="flex flex-wrap items-center justify-between gap-2">
      {first ? (
        <Link href={first} className="flex min-h-11 items-center text-sm font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
          Kembali ke awal
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next}
          className="flex min-h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-4 text-sm font-semibold transition-colors duration-150 hover:bg-panel-nested"
        >
          Berikutnya<span className="sr-only"> {label}</span> <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </nav>
  );
}

function EmptyNote({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[18px] border border-dashed border-line-strong p-6">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
      {action && (
        <Link href={action.href} className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-[3px]">
          {action.label} <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}

const GUEST_POINTS = [
  { icon: Heart, title: 'Disarankan dari minat', body: 'Orang dengan minat, jurusan, dan kegiatan yang sama muncul lebih dulu — lengkap dengan alasannya.' },
  { icon: UserPlus, title: 'Ajakan dua arah', body: 'Terhubung hanya kalau kedua pihak setuju. Kalau sama-sama mengajak, kalian langsung terhubung.' },
  { icon: ShieldCheck, title: 'Kamu yang memilih terlihat', body: 'Tersembunyi secara bawaan. Email dan kegiatan yang kamu simpan tidak pernah ditampilkan.' },
] as const;

function GuestConnections({ categories }: { categories: Parameters<typeof buildPreviewGraph>[0] }) {
  const preview = buildPreviewGraph(categories);
  return (
    <div className="container-page pb-16 pt-10">
      <div className="grid items-center gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
        <header className="enter flex flex-col gap-4 [animation-duration:900ms]">
          <span className="font-mono text-[13px] text-ink-muted">Jaringan</span>
          <h1 className="text-[clamp(36px,5vw,56px)] leading-[1.02]">Temukan rekan satu minat, lihat semua sambungannya.</h1>
          <p className="max-w-[48ch] text-[16px] leading-relaxed text-ink-muted">
            Koneksi memetakan orang, minat, dan kegiatan jadi satu graf — supaya kamu tahu siapa yang bisa diajak satu tim sebelum
            tenggat lomba datang.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/login?next=%2Fconnections" className="flex h-11 items-center rounded-card bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-hover">
              Masuk untuk mulai
            </Link>
            <Link href="/register" className="flex h-11 items-center rounded-card border border-line-strong/70 px-5 text-sm font-semibold hover:bg-panel-nested">
              Buat akun gratis
            </Link>
          </div>
        </header>
        <div className="enter [animation-delay:150ms] [animation-duration:900ms]">
          <NetworkGraphView graph={preview} returnTo="/connections" preview summary="kamu di tengah, tersambung ke teman dan minat" />
          <p className="mt-2 text-center text-[12.5px] text-ink-muted">Contoh bentuk peta — tanpa data orang sungguhan.</p>
        </div>
      </div>

      <ul className="mt-16 grid gap-8 border-t border-line pt-10 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {GUEST_POINTS.map((point) => (
          <li key={point.title} className="flex flex-col gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-card bg-panel-nested">
              <point.icon aria-hidden className="size-[18px]" />
            </span>
            <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{point.title}</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-muted">{point.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
