import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Check, History, Inbox, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { EventReviewCard } from '@/components/admin/event-review-card';
import { SubmissionReviewCard } from '@/components/admin/submission-review-card';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checkAdminAccess } from '@/lib/auth';
import { demoDataCreatedAt, getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { dataMode } from '@/lib/env';
import { resetDemoDataAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Antrean moderasi',
  robots: { index: false, follow: false },
};

const STATUS_MESSAGE: Record<string, string> = {
  forbidden: 'Kamu tidak punya izin untuk meninjau kiriman ini.',
  invalid: 'Permintaan tidak dikenali. Muat ulang halaman lalu coba lagi.',
  failed: 'Keputusan gagal disimpan. Coba lagi sebentar lagi.',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusKey = Array.isArray(params.status) ? params.status[0] : params.status;
  // hasOwn, bukan akses indeks biasa: `?status=constructor` akan membaca
  // properti prototype Object dan mencoba merender sebuah fungsi.
  const statusMessage =
    statusKey && Object.hasOwn(STATUS_MESSAGE, statusKey) ? STATUS_MESSAGE[statusKey] : undefined;
  const gate = await checkAdminAccess();

  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">
          {gate.reason === 'unauthenticated'
            ? 'Masuk dengan akun admin untuk membuka antrean moderasi.'
            : 'Akunmu tidak punya peran admin. Hubungi pengelola kalau ini keliru.'}
        </p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const repository = await getEventRepository();
  const demoCreatedAt = demoDataCreatedAt();
  const [pending, submissions] = await Promise.all([
    repository.listByStatus('PENDING', 50),
    repository.listSubmissions('PENDING', 50),
  ]);

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Antrean moderasi</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Hasil ekstraksi otomatis menunggu verifikasi manusia. Setujui hanya setelah tautan
            pendaftaran dan tenggatnya dicek ke sumber aslinya.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={pending.length > 0 ? 'warning' : 'success'}>
            <Inbox aria-hidden className="size-3.5" />
            {pending.length} menunggu
          </Badge>
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/riwayat">
              <History aria-hidden /> Riwayat moderasi
            </Link>
          </Button>
        </div>
      </header>

      {statusMessage && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-card border border-danger-line bg-danger-soft p-4 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{statusMessage}</p>
        </div>
      )}

      <ActionFeedback params={params} className="mb-6" />

      {gate.reason === 'demo' && (
        <div
          role="note"
          className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-card border border-caution-line bg-caution-soft p-4 text-sm text-caution"
        >
          <p className="flex max-w-2xl items-start gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">Admin demo.</strong> Keputusanmu mengubah data contoh
              yang dilihat semua pengunjung pratinjau, dan data itu diatur ulang otomatis setiap 6 jam
              {demoCreatedAt ? ` (terakhir ${formatDateTimeId(demoCreatedAt.toISOString())})` : ''}.
              Di produksi, halaman ini mensyaratkan akun berperan{' '}
              <code className="rounded-sm bg-panel-nested px-1">ADMIN</code>.
            </span>
          </p>
          <form action={resetDemoDataAction}>
            <Button type="submit" variant="secondary" size="sm">
              <RotateCcw aria-hidden />
              Atur ulang data demo
            </Button>
          </form>
        </div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-panel px-6 py-16 text-center">
          <Check aria-hidden className="mx-auto size-8 text-success" />
          <h2 className="mt-3 text-lg font-semibold">Antrean bersih</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Tidak ada kiriman yang menunggu. Scraper berikutnya jalan pukul 02:00 WIB.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((event) => (
            <EventReviewCard key={event.id} event={event} />
          ))}
        </ul>
      )}

      <section aria-labelledby="kiriman-komunitas" className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="kiriman-komunitas" className="flex items-center gap-2 text-2xl">
            <Users aria-hidden className="size-5 text-ink-muted" />
            Kiriman komunitas
          </h2>
          <Badge variant={submissions.length > 0 ? 'warning' : 'success'}>
            {submissions.length} menunggu
          </Badge>
        </div>
        {submissions.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-panel px-6 py-8 text-center text-sm text-ink-muted">
            Tidak ada kiriman dari halaman /submit yang menunggu.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {submissions.map((submission) => (
              <SubmissionReviewCard key={submission.id} submission={submission} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-ink-faint">
        Sumber data saat ini: <code>{dataMode === 'supabase' ? 'Supabase' : 'seed lokal'}</code>
      </p>
    </div>
  );
}
