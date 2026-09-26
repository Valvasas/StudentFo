import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, History, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import type { EventStatus, ModerationLogEntry } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Riwayat moderasi',
  robots: { index: false, follow: false },
};

const HISTORY_LIMIT = 100;

const STATUS_TEXT: Record<EventStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  EXPIRED: 'Kedaluwarsa',
};

const STATUS_VARIANT: Record<EventStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
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
export default async function ModerationHistoryPage() {
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

  return (
    <div className="container-page py-8">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Kembali ke antrean
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="flex items-center gap-2 text-3xl">
          <History aria-hidden className="size-7 text-ink-muted" />
          Riwayat moderasi
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Setiap perubahan status kegiatan dan kiriman komunitas, terbaru di atas ({HISTORY_LIMIT}{' '}
          terakhir). Log ini tidak bisa diubah atau dihapus dari aplikasi.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-panel px-6 py-12 text-center text-sm text-ink-muted">
          Belum ada keputusan moderasi.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-card border border-line bg-panel p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="neutral">{entry.subjectType === 'event' ? 'Kegiatan' : 'Kiriman'}</Badge>
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
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
