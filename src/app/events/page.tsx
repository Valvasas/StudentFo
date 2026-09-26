import type { Metadata } from 'next';
import { EmptyState } from '@/components/event/empty-state';
import { EventGrid } from '@/components/event/event-grid';
import { FilterBar } from '@/components/event/filter-bar';
import { Pagination } from '@/components/event/pagination';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { BeasiswaBoard } from '@/components/listing/beasiswa-board';
import { parseEligibilityLevel } from '@/lib/eligibility';
import { Breadcrumb, PageTitle } from '@/components/listing/listing-ui';
import { LombaBoard } from '@/components/listing/lomba-board';
import { MagangBoard } from '@/components/listing/magang-board';
import { SeminarAgenda } from '@/components/listing/seminar-agenda';
import { WorkshopCalendar } from '@/components/listing/workshop-calendar';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { eventTypeNavFor } from '@/lib/event-type-nav';
import {
  buildEventHref,
  hasActiveFilters,
  parseEventQuery,
  type RawSearchParams,
} from '@/lib/search-params';

export const dynamic = 'force-dynamic';

const TITLES: Record<string, { title: string; description: string }> = {
  LOMBA: { title: 'Info lomba', description: 'Lomba yang masih buka untuk pelajar dan mahasiswa, urut dari tenggat terdekat.' },
  BEASISWA: { title: 'Beasiswa', description: 'Beasiswa yang masih membuka pendaftaran, lengkap dengan jenjang yang bisa mengajukan.' },
  MAGANG: { title: 'Magang', description: 'Lowongan magang dan praktik kerja dari penyelenggara yang sudah ditinjau.' },
  WORKSHOP: { title: 'Workshop & pelatihan', description: 'Kelas praktik dan pelatihan, disusun seperti kalender.' },
  KONFERENSI: { title: 'Seminar & konferensi', description: 'Agenda seminar dan konferensi per tanggal.' },
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<RawSearchParams> }): Promise<Metadata> {
  const nav = eventTypeNavFor(parseEventQuery(await searchParams).types);
  const page = nav ? TITLES[nav.key] : undefined;
  return {
    title: page?.title ?? 'Jelajahi kegiatan',
    description:
      page?.description ??
      'Cari dan saring lomba, beasiswa, magang, workshop, dan kegiatan pengembangan lain berdasarkan jenis, jenjang pendidikan, dan bidang.',
  };
}

/**
 * Daftar kegiatan. Satu rute, lima tata letak (ADR-039): tab kategori di
 * navbar memilih tata letak khas jenisnya (kanvas desain Info Lomba,
 * Beasiswa, Magang, Workshop, Seminar); filter lain atau campuran jenis
 * memakai tata letak umum. Semuanya tetap satu URL kanonik per kombinasi
 * filter dan berfungsi tanpa JavaScript.
 *
 * PERINGATAN UNTUK PERUBAHAN BERIKUTNYA: JANGAN tambahkan `loading.tsx`
 * di `src/app/` (root) atau di `src/app/events/`.
 *
 * Berkas loading membuat Suspense boundary yang membungkus seluruh segmen
 * DAN anak-anaknya. Akibatnya kerangka halaman langsung di-stream dengan
 * status 200, sehingga `notFound()` di `events/[slug]` tidak lagi sempat
 * mengubah status jadi 404 — halaman "tidak ditemukan" tetap tampil, tapi
 * ke mesin pencari ia terbaca sebagai halaman sah (soft 404) dan ikut
 * diindeks. Ini sudah pernah terjadi dan sudah diverifikasi ulang dengan
 * curl.
 *
 * Dan JANGAN pula membungkus hasil dengan <Suspense> manual. Konten yang
 * di-stream dikirim di dalam `<div hidden>` dan baru ditampilkan oleh
 * JavaScript; tanpa JS (jaringan kampus yang memblokir skrip, ponsel lawas)
 * halaman ini pernah hanya menampilkan "Memuat daftar kegiatan" — tanpa
 * filter, tanpa hasil — padahal filter di sini dirancang berfungsi tanpa JS.
 * Query listing sudah di-cache (ADR-034), jadi menunggu data sebelum
 * mengirim HTML tidak mahal. Dikunci tests/e2e/demo-journey.spec.ts.
 */
export default async function EventsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const rawParams = await searchParams;
  const query = parseEventQuery(rawParams);
  const nav = eventTypeNavFor(query.types);
  const [repository, user] = await Promise.all([getEventRepository(), getSessionUser()]);
  const profile = user ? { educationLevel: user.educationLevel, interests: user.interests } : null;
  const now = new Date();
  const currentHref = buildEventHref(query);

  // Papan berbasis tanggal (lomba, workshop, seminar, beasiswa) selalu urut
  // tenggat — pengelompokan per minggu/tanggal tidak bermakna di urutan lain.
  const boardSort = nav && nav.key !== 'MAGANG' ? 'deadline' : query.sort;
  const [categories, result, savedEventIds] = await Promise.all([
    repository.listCategories(),
    // Workshop memuat satu halaman penuh: strip kalender menyaring per hari
    // di halaman ini, jadi semakin banyak baris yang terbawa semakin akurat.
    repository.listEvents({ ...query, sort: boardSort, pageSize: nav?.key === 'WORKSHOP' ? 48 : nav ? 24 : query.pageSize, profile }),
    user ? repository.listSavedEventIds(user.id) : Promise.resolve([] as readonly string[]),
  ]);
  const board = { query, result, categories, savedIds: savedEventIds, currentHref, now };
  const feedback = <ActionFeedback params={rawParams} className="container-page mt-6 max-w-2xl" />;

  switch (nav?.key) {
    case 'LOMBA': {
      const top = await repository.listEvents({ types: nav.types, sort: 'deadline', pageSize: 1 });
      return (
        <>
          {feedback}
          <LombaBoard {...board} top={top.items[0] ?? null} />
        </>
      );
    }
    case 'BEASISWA': {
      const level = parseEligibilityLevel(rawParams, user?.educationLevel ?? null);
      // Dua hitungan terpisah dari halaman yang sedang tampil: angka "N dari M"
      // harus mencakup semua halaman, bukan 24 baris yang kebetulan terlihat.
      const [open, eligible] = await Promise.all([
        repository.listEvents({ types: nav.types, search: query.search, pageSize: 1 }),
        repository.listEvents({ types: nav.types, search: query.search, levels: [level, 'UMUM'], pageSize: 1 }),
      ]);
      return (
        <>
          {feedback}
          <BeasiswaBoard
            {...board}
            level={level}
            userLevel={user?.educationLevel ?? null}
            totalOpen={open.total}
            eligibleTotal={eligible.total}
          />
        </>
      );
    }
    case 'MAGANG': {
      // Jumlah lowongan per kota untuk pemilih lokasi. Diambil dari satu
      // halaman terbesar yang diizinkan (MAX_PAGE_SIZE): cukup untuk
      // mengurutkan kota di pemilih; di atas 48 lowongan angkanya perkiraan.
      const all = await repository.listEvents({ types: nav.types, pageSize: 48 });
      const locationCounts: Record<string, number> = { __all__: all.total, __online__: 0 };
      for (const event of all.items) {
        if (event.isOnline) locationCounts.__online__ = (locationCounts.__online__ ?? 0) + 1;
        else if (event.location) locationCounts[event.location] = (locationCounts[event.location] ?? 0) + 1;
      }
      return (
        <>
          {feedback}
          <MagangBoard {...board} locationCounts={locationCounts} />
        </>
      );
    }
    case 'WORKSHOP':
      return (
        <>
          {feedback}
          <WorkshopCalendar {...board} rawParams={rawParams} />
        </>
      );
    case 'KONFERENSI':
      return (
        <>
          {feedback}
          <SeminarAgenda {...board} />
        </>
      );
    default:
      return (
        <div className="container-page py-12">
          <header className="enter mb-8 flex flex-col gap-3">
            <Breadcrumb current="Semua kegiatan" />
            <PageTitle>Semua kegiatan</PageTitle>
            <p className="max-w-2xl text-base leading-relaxed text-ink-muted">
              Saring berdasarkan jenis, jenjang, dan bidang. Setiap kombinasi filter punya alamat sendiri — tinggal salin
              tautannya kalau mau dibagikan.
            </p>
          </header>
          <ActionFeedback params={rawParams} className="mb-6 max-w-2xl" />
          <FilterBar query={query} categories={categories} resultCount={result.total} />
          <div className="mt-8">
            {result.items.length > 0 ? (
              <>
                <EventGrid events={result.items} savedEventIds={savedEventIds} returnTo={currentHref} />
                <div className="mt-8">
                  <Pagination query={query} totalPages={result.totalPages} />
                </div>
              </>
            ) : (
              <EmptyState
                description={
                  hasActiveFilters(query)
                    ? 'Filter yang kamu pasang terlalu sempit. Coba kurangi satu-dua filter, atau pakai kata kunci yang lebih umum.'
                    : 'Belum ada kegiatan yang tayang. Data baru masuk setiap hari lewat proses verifikasi.'
                }
              />
            )}
          </div>
        </div>
      );
  }
}
