import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, Heart, Search, ShieldCheck, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { NetworkGraphView } from '@/components/network/network-graph';
import { HiddenProfileBanner, NetworkSettings } from '@/components/network/network-settings';
import { BlockedRow, ConnectionRow, IncomingRequestCard, OutgoingRow, SuggestionCard } from '@/components/network/person-cards';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { CONNECTION_PAGE, NETWORK_LIMITS, suggestionReasons } from '@/lib/network';
import { buildNetworkGraph, buildPreviewGraph } from '@/lib/network-graph';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { NetworkEventRef } from '@/types/domain';

/**
 * Koneksi (ADR-040): ajakan masuk → cari koneksi + daftar → peta → diblokir.
 *
 * Urutannya mengikuti prioritas tindakan: yang menunggu jawaban PEMBACA
 * tampil paling atas, karena itulah satu-satunya bagian yang membuat orang
 * lain menunggu. Peta (eksplorasi, tanpa tindakan langsung) di bawah
 * direktori, bukan di antara ajakan dan tombol "Hubungkan" (ADR-044). Saringan saran memakai `<form method="get">` + URL (aturan
 * AGENTS.md §9); peta ikut menampilkan hasil saringan yang sama.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Koneksi',
  description: 'Temukan pelajar & mahasiswa dengan minat yang sama, lihat peta jaringanmu, dan bangun tim untuk lomba berikutnya.',
};

const VIEWER_EVENT_LIMIT = 50;
const TEAM_LINK_LIMIT = 400;
const MAX_CONNECTION_PAGES = CONNECTION_PAGE.maxLimit / CONNECTION_PAGE.size;

/**
 * "Muat lebih banyak" tanpa JavaScript (AGENTS.md §9): `?tampil=N` memuat N
 * halaman sekaligus dari awal, jadi yang sudah terlihat tetap terlihat.
 * Kursor keyset di kontrak repository tidak bisa "menambahkan" ke halaman
 * yang dirender server tanpa state klien.
 */
function parseConnectionPages(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), MAX_CONNECTION_PAGES) : 1;
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository] = await Promise.all([searchParams, getSessionUser(), getEventRepository()]);
  const categories = await repository.listCategories();

  if (!user) return <GuestConnections categories={categories} />;

  const search = (firstParam(params.q) ?? '').slice(0, 80);
  const rawInterest = firstParam(params.minat) ?? null;
  const interest = categories.some((category) => category.slug === rawInterest) ? rawInterest : null;
  const pages = parseConnectionPages(firstParam(params.tampil));
  const filters = { ...(search ? { q: search } : {}), ...(interest ? { minat: interest } : {}) };
  const query = new URLSearchParams({ ...filters, ...(pages > 1 ? { tampil: String(pages) } : {}) }).toString();
  const returnTo = query ? `/connections?${query}` : '/connections';
  const moreHref = `/connections?${new URLSearchParams({ ...filters, tampil: String(pages + 1) }).toString()}#koneksimu`;

  const [profile, connectionPage, counts, trackerItems, blocked] = await Promise.all([
    repository.getNetworkProfile(user.id),
    repository.listConnections(user.id, { limit: pages * CONNECTION_PAGE.size, cursor: null }),
    repository.countConnections(user.id),
    repository.listTrackerItems(user.id),
    repository.listBlockedPeople(user.id),
  ]);
  const connections = connectionPage.items;
  const viewerEvents: NetworkEventRef[] = trackerItems
    .slice(0, VIEWER_EVENT_LIMIT)
    .map(({ event }) => ({ id: event.id, slug: event.slug, title: event.title, eventType: event.eventType }));
  const suggestions = await repository.suggestPeople(user, { search, interest, limit: NETWORK_LIMITS.suggestionLimit, viewerEvents });
  const teamLinks = await repository.listTeamLinks(
    [user.id, ...connections.map((connection) => connection.person.userId), ...suggestions.map((item) => item.person.userId)],
    TEAM_LINK_LIMIT,
  );

  const graph = buildNetworkGraph({ viewer: user, connections, suggestions, categories, viewerEvents, teamLinks });
  const categoryName = (slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug;
  const accepted = connections.filter((connection) => connection.status === 'ACCEPTED');
  const incoming = connections.filter((connection) => connection.status === 'PENDING' && connection.direction === 'incoming');
  const outgoing = connections.filter((connection) => connection.status === 'PENDING' && connection.direction === 'outgoing');
  const filtered = Boolean(search || interest);
  const now = new Date();
  const summary = [
    `${counts.accepted} koneksi`,
    `${counts.incoming} ajakan masuk`,
    `${counts.outgoing} ajakan terkirim`,
    `${suggestions.length} saran`,
  ].join(', ');

  return (
    <div className="container-page pb-16 pt-10">
      {/* Tanpa kartu statistik di samping judul: tiap angka sudah tampil di
          judul bagiannya sendiri (Menunggu jawabanmu, Koneksimu, Ajakan
          terkirim), tempat pengguna bisa langsung bertindak atasnya. */}
      <div>
        <header className="enter flex flex-col gap-3 [animation-duration:900ms]">
          <span className="font-mono text-[13px] text-ink-muted">Jaringan</span>
          <h1 className="text-[clamp(36px,5vw,52px)] leading-[1.02]">Koneksi</h1>
          <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-ink-muted">
            Lomba bagus sering kalah oleh tim yang belum lengkap. Temukan orang dengan minat yang sama, lihat bagaimana kalian
            tersambung, lalu ajak mereka satu tim.
          </p>
        </header>
      </div>

      <ActionFeedback params={params} className="mt-6 max-w-2xl" />
      {!profile.discoverable && (
        <div className="mt-6">
          <HiddenProfileBanner />
        </div>
      )}

      {incoming.length > 0 && (
        <section aria-labelledby="ajakan-masuk" className="mt-10 flex flex-col gap-4">
          <SectionTitle id="ajakan-masuk" title="Menunggu jawabanmu" count={counts.incoming} hint="Terima atau tolak — pengirim tidak diberi tahu alasannya" />
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
            {incoming.map((connection, index) => (
              <li key={connection.id} className="enter [animation-duration:600ms]" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
                <IncomingRequestCard connection={connection} categoryName={categoryName} viewerInterests={user.interests} returnTo={returnTo} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="cari-koneksi" className="flex min-w-0 flex-col gap-4">
          <SectionTitle id="cari-koneksi" title="Cari koneksi" count={suggestions.length} hint={filtered ? 'Hasil saringan' : 'Paling nyambung denganmu di atas'} />

          <form method="get" action="/connections" role="search" className="flex flex-col gap-3">
            <div className="flex gap-2">
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
              {interest && <input type="hidden" name="minat" value={interest} />}
              <button type="submit" className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                Cari
              </button>
            </div>
            <nav aria-label="Saring minat" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              <FilterChip href={search ? `/connections?q=${encodeURIComponent(search)}` : '/connections'} active={!interest}>
                Semua minat
              </FilterChip>
              {categories.map((category) => {
                const next = new URLSearchParams({ ...(search ? { q: search } : {}), minat: category.slug }).toString();
                return (
                  <FilterChip key={category.slug} href={`/connections?${next}`} active={interest === category.slug}>
                    {user.interests.includes(category.slug) && <Heart aria-hidden className="size-3" />}
                    {category.name}
                  </FilterChip>
                );
              })}
            </nav>
            {filtered && (
              <Link href="/connections" className="flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-ink-muted hover:text-ink">
                <X aria-hidden className="size-3.5" /> Hapus saringan
              </Link>
            )}
          </form>

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
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.person.userId} className="enter [animation-duration:600ms]" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
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
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[92px]">
          <section aria-labelledby="koneksimu" className="flex flex-col rounded-[18px] border border-line p-5">
            <h2 id="koneksimu" className="flex scroll-mt-28 items-baseline gap-2 text-base font-semibold">
              Koneksimu <span className="font-mono text-[13px] font-normal text-ink-muted">{counts.accepted}</span>
            </h2>
            {counts.accepted === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">Belum ada. Orang yang menerima ajakanmu akan muncul di sini.</p>
            ) : (
              <ul className="mt-1 flex max-h-[420px] flex-col divide-y divide-line overflow-y-auto overscroll-contain">
                {accepted.map((connection) => (
                  <ConnectionRow key={connection.id} connection={connection} returnTo={returnTo} now={now} />
                ))}
              </ul>
            )}
            {connectionPage.nextCursor && (
              <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3">
                <p className="text-[12px] text-ink-muted">
                  Menampilkan {accepted.length} dari {counts.accepted} koneksi
                </p>
                {pages < MAX_CONNECTION_PAGES ? (
                  <Link href={moreHref} className="flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                    <ChevronDown aria-hidden className="size-4" /> Muat lebih banyak<span className="sr-only"> koneksi</span>
                  </Link>
                ) : (
                  <p className="text-[12px] leading-relaxed text-ink-muted">
                    Halaman ini menampilkan paling banyak {CONNECTION_PAGE.maxLimit} koneksi & ajakan terbaru.
                  </p>
                )}
              </div>
            )}
          </section>

          {outgoing.length > 0 && (
            <section aria-labelledby="terkirim" className="flex flex-col rounded-[18px] border border-line p-5">
              <h2 id="terkirim" className="flex items-baseline gap-2 text-base font-semibold">
                Ajakan terkirim <span className="font-mono text-[13px] font-normal text-ink-muted">{counts.outgoing}</span>
              </h2>
              <ul className="mt-1 flex flex-col divide-y divide-line">
                {outgoing.map((connection) => (
                  <OutgoingRow key={connection.id} connection={connection} returnTo={returnTo} now={now} />
                ))}
              </ul>
            </section>
          )}

          <NetworkSettings viewer={user} profile={profile} categoryName={categoryName} returnTo={returnTo} />
        </aside>
      </div>

      <section aria-labelledby="peta-koneksi" className="mt-12 flex flex-col gap-4">
        <SectionTitle
          id="peta-koneksi"
          title="Peta koneksi"
          hint={graph.hiddenPeople > 0 ? `${graph.hiddenPeople} orang tidak digambar agar peta tetap terbaca` : 'Garis = sambungan · simpul besar = banyak sambungan'}
        />
        <div className="enter [animation-delay:150ms] [animation-duration:900ms]">
          <NetworkGraphView graph={graph} returnTo={returnTo} summary={summary} />
        </div>
        {counts.accepted === 0 && counts.incoming === 0 && (
          <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-muted">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
            {user.interests.length > 0
              ? 'Petamu masih berisi kamu dan minatmu. Ajak satu orang dari saran di atas — peta langsung tumbuh.'
              : 'Petamu masih sepi. Isi peminatan di profil supaya saran di atas lebih nyambung denganmu.'}
            {user.interests.length === 0 && (
              <Link href="/profile/interests" className="shrink-0 font-semibold text-ink underline underline-offset-[3px]">
                Isi peminatan
              </Link>
            )}
          </p>
        )}
      </section>

      {/* Di luar <aside> yang lengket: aside sudah lebih tinggi dari layar, dan bagian bawahnya baru terjangkau di ujung halaman. */}
      <section id="diblokir" aria-labelledby="diblokir-title" className="mt-12 flex scroll-mt-28 flex-col gap-4">
        <SectionTitle id="diblokir-title" title="Diblokir" count={blocked.length} hint="Mereka tidak bisa menemukan atau mengajakmu, dan tidak diberi tahu" />
        {blocked.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            Belum ada. Blokir lewat menu opsi di daftar koneksi, kartu ajakan, atau panel peta.
          </p>
        ) : (
          <ul className="flex max-w-2xl flex-col divide-y divide-line rounded-[18px] border border-line px-5">
            {blocked.map((person) => (
              <BlockedRow key={person.userId} person={person} returnTo={returnTo} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ id, title, count, hint }: { id: string; title: string; count?: number; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="text-[22px] font-bold tracking-[-0.025em]">
        {title}
      </h2>
      {count !== undefined && <span className="font-mono text-[13px] text-ink-muted">{count}</span>}
      <span aria-hidden className="hidden h-px flex-1 self-center bg-line sm:block" />
      {hint && <span className="text-[13px] text-ink-muted">{hint}</span>}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm border px-3.5 text-[13.5px] font-medium transition-colors duration-150 ease-snap',
        active ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong',
      )}
    >
      {children}
    </Link>
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
