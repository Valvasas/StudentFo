import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/admin-nav';
import { History, RotateCcw, ShieldCheck } from 'lucide-react';
import { restoreRejectedAction } from '@/app/admin/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import type { ModerationLogEntry, ModerationStatus, ModerationSubject } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Riwayat moderasi',
  robots: { index: false, follow: false },
};

const HISTORY_LIMIT = 100;

const STATUS_TEXT: Record<ModerationStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  EXPIRED: 'Kedaluwarsa',
  VERIFIED: 'Terverifikasi',
  REVOKED: 'Dicabut',
};

const STATUS_VARIANT: Record<ModerationStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  VERIFIED: 'success',
  REVOKED: 'danger',
};

const SUBJECT_TEXT: Record<ModerationSubject, string> = {
  event: 'Kegiatan',
  submission: 'Kiriman',
  organizer: 'Penyelenggara',
  claim: 'Klaim acara',
  revision: 'Perubahan acara',
};

function actorLabel(entry: ModerationLogEntry): string {
  if (!entry.actorId) return 'Sistem / di luar aplikasi';
  return entry.actorName ?? 'Admin (akun dihapus)';
}

/**
 * Riwayat keputusan moderasi, dibaca dari log append-only yang diisi trigger
 * (migration 20260926130001). Dipisah dari /admin supaya antrean tetap
 * ringkas; halaman ini untuk menjawab "siapa menyetujui ini, dan kapan?"
 * begitu ada lebih dari satu admin.
 */
export default async function ModerationHistoryPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const gate = await checkAdminAccess();
  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">Riwayat moderasi hanya untuk akun berperan admin.</p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin%2Friwayat">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const repository = await getEventRepository();
  const entries = await repository.listModerationLog(HISTORY_LIMIT);
  // Log diisi trigger di SETIAP perubahan status, jadi entri terbaru per
  // subjek = statusnya sekarang. Hanya itu yang boleh dipulihkan.
  const latestIds = new Set<string>();
  const restorable = new Set<string>();
  for (const entry of entries) {
    if (latestIds.has(entry.subjectId)) continue;
    latestIds.add(entry.subjectId);
    if (entry.toStatus === 'REJECTED' && (entry.subjectType === 'event' || entry.subjectType === 'submission')) restorable.add(entry.id);
  }

  return (
    <div className="container-page py-8">
      <AdminNav active="riwayat" />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl">
          <History aria-hidden className="size-7 text-ink-muted" />
          Riwayat moderasi
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Setiap perubahan status kegiatan, kiriman komunitas, verifikasi penyelenggara, klaim, dan perubahan
          acara — terbaru di atas ({HISTORY_LIMIT} terakhir). Log ini tidak bisa diubah atau dihapus dari aplikasi.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6 max-w-2xl" />

      {entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-panel px-6 py-12 text-center text-sm text-ink-muted">
          Belum ada keputusan moderasi.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-card border border-line bg-panel p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="neutral">{SUBJECT_TEXT[entry.subjectType]}</Badge>
                {entry.fromStatus && (
                  <>
                    <Badge variant={STATUS_VARIANT[entry.fromStatus]}>{STATUS_TEXT[entry.fromStatus]}</Badge>
                    <span aria-hidden>→</span>
                    <span className="sr-only">menjadi</span>
                  </>
                )}
                <Badge variant={STATUS_VARIANT[entry.toStatus]}>{STATUS_TEXT[entry.toStatus]}</Badge>
              </div>
              <p className="mt-2 break-words font-semibold">{entry.title}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {actorLabel(entry)} · <time dateTime={entry.createdAt}>{formatDateTimeId(entry.createdAt)}</time>
              </p>
              {entry.reason && <p className="mt-2 text-sm text-ink-soft">Alasan: {entry.reason}</p>}
              {restorable.has(entry.id) && (
                <form action={restoreRejectedAction} className="mt-3">
                  <input type="hidden" name="subjectType" value={entry.subjectType} />
                  <input type="hidden" name="subjectId" value={entry.subjectId} />
                  <SubmitButton className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    <RotateCcw aria-hidden /> Kembalikan ke antrean
                    <span className="sr-only"> — {entry.title}</span>
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
