import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  PlusCircle,
  Send,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { removeTrackerAction, updateTrackerStatusAction } from '@/app/tracker/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import {
  EVENT_TYPE_LABEL,
  TRACKER_STATUS_LABEL,
  TRACKER_STATUSES,
  type TrackerItem,
  type TrackerStatus,
} from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tracker lamaran',
  description:
    'Lacak status lamaran lomba, beasiswa, dan magangmu dalam satu papan: disimpan, sudah daftar, wawancara, diterima.',
};

const STAGES: {
  status: TrackerStatus;
  label: string;
  icon: typeof BookmarkCheck;
  hint: string;
}[] = [
  { status: 'SAVED', label: 'Disimpan', icon: BookmarkCheck, hint: 'Peluang yang kamu incar' },
  { status: 'APPLIED', label: 'Sudah Daftar', icon: Send, hint: 'Berkas atau formulir sudah dikirim' },
  { status: 'INTERVIEW', label: 'Wawancara', icon: Users, hint: 'Tahap seleksi atau wawancara' },
  { status: 'ACCEPTED', label: 'Diterima', icon: Trophy, hint: 'Lolos seleksi / diterima' },
  { status: 'REJECTED', label: 'Ditolak', icon: XCircle, hint: 'Belum berhasil kali ini' },
];

export default async function TrackerPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-panel-nested">
            <Clock aria-hidden className="size-5 text-ink-muted" />
          </span>
          <h1 className="mt-4 text-3xl">Lacak semua lamaranmu di satu papan</h1>
          <p className="mt-3 text-ink-soft">
            Berhenti mengandalkan ingatan dan tangkapan layar. Simpan peluang, tandai saat sudah
            mendaftar, dan lihat mana yang masuk tahap wawancara — lengkap dengan pengingat tenggat.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/login?next=%2Ftracker">Masuk untuk mulai melacak</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/events">
                Jelajahi kegiatan dulu <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Fitur tracker terhubung otomatis dengan akunmu.
          </p>
        </div>

        <ul className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
          {STAGES.slice(0, 3).map((stage) => (
            <li
              key={stage.label}
              className="rounded-card border border-dashed border-line bg-panel p-5 text-center"
            >
              <stage.icon aria-hidden className="mx-auto size-5 text-ink-faint" />
              <p className="mt-2 text-sm font-medium">{stage.label}</p>
              <p className="mt-1 text-xs text-ink-muted">{stage.hint}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const repository = await getEventRepository();
  const items = await repository.listTrackerItems(user.id);

  const itemsByStage = new Map<TrackerStatus, TrackerItem[]>();
  for (const stage of STAGES) {
    itemsByStage.set(stage.status, []);
  }
  for (const item of items) {
    const list = itemsByStage.get(item.status);
    if (list) {
      list.push(item);
    }
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl">Papan tracker lamaran</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Memantau {items.length} kegiatan yang kamu ikuti. Pindahkan tahapan saat statusmu berubah.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="self-start sm:self-auto">
          <Link href="/events">
            <PlusCircle aria-hidden className="size-4" /> Cari peluang lain
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-panel p-12 text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-10 text-ink-muted" />
          <h2 className="mt-4 text-xl">Belum ada kegiatan yang kamu lacak</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            Buka daftar kegiatan dan klik tombol &quot;Simpan ke Tracker&quot; pada lomba, beasiswa,
            atau magang yang ingin kamu ikuti.
          </p>
          <Button asChild className="mt-6">
            <Link href="/events">Jelajahi kegiatan sekarang</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {STAGES.filter((stage) => stage.status !== 'REJECTED').map((stage) => {
            const stageItems = itemsByStage.get(stage.status) ?? [];
            return (
              <section
                key={stage.status}
                className="flex flex-col rounded-card border border-line bg-panel-nested/30 p-4"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <stage.icon aria-hidden className="size-4 text-brand" />
                    <h2 className="text-base font-semibold">{stage.label}</h2>
                  </div>
                  <span className="rounded-pill bg-panel px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                    {stageItems.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {stageItems.length === 0 ? (
                    <div className="rounded-card border border-dashed border-line p-6 text-center text-xs text-ink-muted">
                      Tidak ada kegiatan di tahap ini.
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <TrackerCard key={item.id} item={item} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Tahap Selesai / Gugur (Ditolak) jika ada item */}
      {(itemsByStage.get('REJECTED')?.length ?? 0) > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <XCircle aria-hidden className="size-4 text-caution" />
            <h2 className="text-lg font-semibold">Gugur / Belum Berhasil</h2>
            <span className="rounded-pill bg-panel-nested px-2 py-0.5 text-xs text-ink-muted">
              {itemsByStage.get('REJECTED')?.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {itemsByStage.get('REJECTED')?.map((item) => (
              <TrackerCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TrackerCard({ item }: { item: TrackerItem }) {
  const { event } = item;

  return (
    <article className="flex flex-col gap-2.5 rounded-card border border-line bg-panel p-4 shadow-sm transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
        <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
      </div>

      <div>
        <h3 className="text-sm font-semibold leading-snug">
          <Link
            href={`/events/${event.slug}`}
            className="hover:text-brand-text flex items-center gap-1"
          >
            <span>{event.title}</span>
            <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-muted" />
          </Link>
        </h3>
        <p className="mt-1 text-xs text-ink-muted">{event.organizer}</p>
      </div>

      {item.notes && (
        <p className="rounded-sm bg-panel-nested p-2 text-xs italic text-ink-soft">
          &ldquo;{item.notes}&rdquo;
        </p>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-xs">
        {/* Form ubah status */}
        <form action={updateTrackerStatusAction} className="flex items-center gap-1.5">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="returnTo" value="/tracker" />
          <label htmlFor={`status-${item.id}`} className="sr-only">
            Ubah status
          </label>
          <select
            id={`status-${item.id}`}
            name="status"
            defaultValue={item.status}
            className="h-7 rounded-sm border border-line bg-panel px-2 text-xs text-ink-soft hover:border-line-strong focus:border-brand focus:outline-none"
          >
            {TRACKER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRACKER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-7 rounded-sm border border-line bg-panel-nested px-2 text-xs font-medium text-ink hover:bg-panel-nested/80"
          >
            Ubah
          </button>
        </form>

        {/* Form hapus dari tracker */}
        <form action={removeTrackerAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="returnTo" value="/tracker" />
          <button
            type="submit"
            title="Hapus dari tracker"
            aria-label="Hapus dari tracker"
            className="flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink"
          >
            <Trash2 aria-hidden className="size-3.5" />
          </button>
        </form>
      </div>
    </article>
  );
}
