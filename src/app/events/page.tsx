import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/event/empty-state';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { EventGrid } from '@/components/event/event-grid';
import { FilterBar } from '@/components/event/filter-bar';
import { Pagination } from '@/components/event/pagination';
import { EventGridSkeleton, Skeleton } from '@/components/ui/skeleton';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import {
  buildEventHref,
  hasActiveFilters,
  parseEventQuery,
  type ParsedEventQuery,
  type RawSearchParams,
} from '@/lib/search-params';
import type { Category } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jelajahi kegiatan',
  description:
    'Cari dan saring lomba, beasiswa, magang, workshop, dan kegiatan pengembangan lain berdasarkan jenis, jenjang pendidikan, dan bidang.',
};

/**
 * PERINGATAN UNTUK PERUBAHAN BERIKUTNYA: JANGAN tambahkan `loading.tsx`
 * di `src/app/` (root) atau di `src/app/events/`.
 *
 * Berkas loading membuat Suspense boundary yang membungkus seluruh segmen
 * DAN anak-anaknya. Akibatnya kerangka halaman langsung di-stream dengan
 * status 200, sehingga `notFound()` di `events/[slug]` tidak lagi sempat
 * mengubah status jadi 404 — halaman "tidak ditemukan" tetap tampil, tapi
 * ke mesin pencari ia terbaca sebagai halaman sah (soft 404) dan ikut
 * diindeks. Ini sudah pernah terjadi dan sudah diverifikasi ulang dengan
 * curl. Batas pemuatan di bawah ini sengaja dipasang MANUAL dan hanya
 * melingkupi bagian hasil pencarian.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawParams = await searchParams;
  const query = parseEventQuery(rawParams);
  const repository = await getEventRepository();
  const categories = await repository.listCategories();

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-3xl">Jelajahi kegiatan</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Saring berdasarkan jenis, jenjang, dan bidang. Setiap kombinasi filter punya alamat sendiri —
          tinggal salin tautannya kalau mau dibagikan.
        </p>
      </header>

      <ActionFeedback params={rawParams} className="mb-6 max-w-2xl" />

      {/* `key` dari query: tanpa ini React menganggap boundary-nya sama saat
          filter berubah, dan user melihat hasil lama membeku alih-alih
          skeleton yang menandakan ada pencarian baru berjalan. */}
      <Suspense key={JSON.stringify(query)} fallback={<ResultsFallback />}>
        <Results query={query} categories={categories} />
      </Suspense>
    </div>
  );
}

async function Results({
  query,
  categories,
}: {
  query: ParsedEventQuery;
  categories: readonly Category[];
}) {
  const [repository, user] = await Promise.all([
    getEventRepository(),
    getSessionUser(),
  ]);

  const profile = user ? { educationLevel: user.educationLevel, interests: user.interests } : null;
  const [result, savedEventIds] = await Promise.all([
    repository.listEvents({ ...query, profile }),
    user ? repository.listSavedEventIds(user.id) : Promise.resolve([]),
  ]);

  const currentHref = buildEventHref(query);

  return (
    <>
      <FilterBar query={query} categories={categories} resultCount={result.total} />
      <div className="mt-8">
        {result.items.length > 0 ? (
          <>
            <EventGrid
              events={result.items}
              savedEventIds={savedEventIds}
              returnTo={currentHref}
            />
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
    </>
  );
}

function ResultsFallback() {
  return (
    <>
      <Skeleton className="h-11 w-full" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-pill" />
        ))}
      </div>
      <div className="mt-8">
        <EventGridSkeleton />
      </div>
    </>
  );
}
