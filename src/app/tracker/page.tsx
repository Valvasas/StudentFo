import type { Metadata } from 'next';
import Link from 'next/link';
import { AlarmClock, ArrowRight, BookmarkCheck, Plus, Send, Trophy, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { TrackerCard } from '@/components/tracker/tracker-card';
import { CalendarSketch } from '@/components/ui/illustrations';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, formatDateId } from '@/lib/deadline';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { ACTION_WINDOW_DAYS, needsActionSoon } from '@/lib/tracker-progress';
import { cn } from '@/lib/utils';
import { TRACKER_STATUS_LABEL, TRACKER_STATUSES, type TrackerStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pendaftaran',
  description: 'Lacak status lamaran lomba, beasiswa, dan magangmu dalam satu papan: disimpan, sudah daftar, wawancara, diterima.',
};

const GUEST_STEPS = [
  { icon: BookmarkCheck, title: 'Simpan', text: 'Tandai peluang yang kamu incar dari halaman detail.' },
  { icon: Send, title: 'Daftar', text: 'Daftar di situs resmi, lalu tandai “Sudah daftar”.' },
  { icon: Users, title: 'Seleksi', text: 'Catat saat masuk tahap seleksi atau wawancara.' },
  { icon: Trophy, title: 'Diterima', text: 'Semua riwayat tersimpan di satu papan.' },
];

/**
 * Pendaftaran (kanvas Profil → tab Pendaftaran, dijadikan halaman penuh).
 *
 * Menggantikan papan kanban lima kolom (ADR-009 → ADR-039): satu daftar
 * dengan bilah tahap per baris lebih mudah dibaca di ponsel daripada lima
 * kolom yang harus digeser. Saringan tahap memakai tautan `?tahap=` — tanpa
 * state klien, seperti saringan lain.
 */
export default async function TrackerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()]);

  if (!user) {
    return (
      <div className="container-page py-16">
        <div className="enter mx-auto flex max-w-2xl flex-col items-center gap-4 text-center [animation-duration:900ms]">
          <CalendarSketch className="text-ink" />
          <h1 className="text-[clamp(32px,5vw,44px)] leading-[1.05]">Lacak semua pendaftaranmu di satu papan</h1>
          <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-ink-muted">
            Berhenti mengandalkan ingatan dan tangkapan layar. Simpan peluang, tandai saat sudah mendaftar, dan lihat mana yang masuk tahap seleksi —
            lengkap dengan pengingat tenggat.
          </p>
          <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
            <Link
              href="/login?next=%2Ftracker"
              className="flex h-12 items-center rounded-card bg-brand px-5 text-[15px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover"
            >
              Masuk untuk mulai melacak
            </Link>
            <Link href="/events" className="flex h-12 items-center gap-1.5 rounded-card px-4 text-[15px] font-medium hover:bg-panel-nested">
              Jelajahi kegiatan dulu <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
        <ol className="mx-auto mt-14 grid max-w-4xl gap-px overflow-hidden rounded-[18px] border border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {GUEST_STEPS.map((step, index) => (
            <li key={step.title} className="enter flex flex-col gap-3 bg-panel p-5 [animation-duration:800ms]" style={{ animationDelay: `${120 + index * 80}ms` }}>
              <span className="flex items-center justify-between">
                <step.icon aria-hidden className="size-5" />
                <span className="font-mono text-xs text-ink-muted">0{index + 1}</span>
              </span>
              <span className="text-[15px] font-semibold">{step.title}</span>
              <span className="text-[13.5px] leading-snug text-ink-muted">{step.text}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const repository = await getEventRepository();
  const items = await repository.listTrackerItems(user.id);
  const now = new Date();

  const requested = firstParam(params.tahap);
  const filter = TRACKER_STATUSES.find((status) => status === requested) ?? null;
  const counts = Object.fromEntries(TRACKER_STATUSES.map((status) => [status, items.filter((item) => item.status === status).length])) as Record<TrackerStatus, number>;
  const byDeadline = (left: (typeof items)[number], right: (typeof items)[number]) =>
    (left.event.primaryDeadlineAt ?? '9999').localeCompare(right.event.primaryDeadlineAt ?? '9999');
  const shown = items.filter((item) => !filter || item.status === filter).sort(byDeadline);
  const actionable = needsActionSoon(items, now);
  const returnTo = filter ? `/tracker?tahap=${filter}` : '/tracker';

  return (
    <AccountShell user={user} active="daftar">
      <div className="flex flex-col gap-7">
        <div className="enter flex flex-wrap items-end justify-between gap-4 [animation-duration:800ms]">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[36px] leading-[1.05] tracking-[-0.04em]">Pendaftaran</h1>
            <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-ink-muted">
              {items.length > 0
                ? `Memantau ${items.length} kegiatan. Ubah tahapnya setiap kali ada kabar dari penyelenggara.`
                : 'Simpan kegiatan dari halaman detail, lalu lacak tahapnya di sini.'}
            </p>
          </div>
          <Link href="/events" className="flex h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-4 text-sm font-semibold transition-colors duration-150 hover:bg-panel-nested">
            <Plus aria-hidden className="size-4" /> Cari peluang lain
          </Link>
        </div>

        <ActionFeedback params={params} className="max-w-2xl" />

        {items.length > 0 && (
          <div className="enter grid gap-px overflow-hidden rounded-[18px] border border-line bg-line [animation-delay:80ms] [animation-duration:800ms] [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
            {(['SAVED', 'APPLIED', 'INTERVIEW', 'ACCEPTED'] as const).map((status) => (
              <div key={status} className="flex flex-col gap-1 bg-panel px-5 py-4">
                <span className="text-[32px] font-bold leading-none tracking-[-0.04em]">{counts[status]}</span>
                <span className="text-[13px] text-ink-muted">{TRACKER_STATUS_LABEL[status]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Satu-satunya bagian halaman ini yang meminta sesuatu dari pengguna,
            jadi ia mendapat tempat sendiri — bukan satu ubin di antara angka.
            Hanya yang belum didaftar: yang sudah daftar tidak butuh tindakan. */}
        {actionable.length > 0 && (
          <section aria-labelledby="perlu-tindakan" className="enter flex flex-col gap-3 rounded-[18px] border border-line-strong/70 p-5 [animation-delay:120ms] [animation-duration:800ms] sm:p-6">
            <h2 id="perlu-tindakan" className="flex items-center gap-2 text-[17px] font-semibold">
              <AlarmClock aria-hidden className="size-[18px]" />
              Tutup dalam {ACTION_WINDOW_DAYS} hari, belum kamu daftar
            </h2>
            <ul className="flex flex-col divide-y divide-line">
              {actionable.slice(0, 3).map(({ item, daysLeft }) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{item.event.title}</span>
                    <span className="text-[13px] text-ink-muted">
                      Tutup {item.event.primaryDeadlineAt ? formatDateId(item.event.primaryDeadlineAt) : '—'} ·{' '}
                      <strong className="font-semibold text-ink">{daysLeftLabel(daysLeft).toLowerCase()}</strong>
                    </span>
                  </span>
                  <Link
                    href={`/tracker/${item.event.slug}`}
                    className="flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-[3px]"
                  >
                    Siapkan pendaftaran<span className="sr-only"> {item.event.title}</span>
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
            {actionable.length > 3 && (
              <Link href="/tracker?tahap=SAVED" className="self-start text-sm text-ink-muted underline underline-offset-[3px]">
                dan {actionable.length - 3} lainnya di tahap Disimpan
              </Link>
            )}
          </section>
        )}

        {items.length > 0 && (
          <nav aria-label="Saring tahap" className="-mb-2 flex flex-wrap gap-1.5">
            {[null, ...TRACKER_STATUSES].map((status) => {
              const active = status === filter;
              const count = status ? counts[status] : items.length;
              if (status && count === 0 && !active) return null;
              return (
                <Link
                  key={status ?? 'semua'}
                  href={status ? `/tracker?tahap=${status}` : '/tracker'}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-sm border px-3.5 text-[13.5px] font-medium transition-colors duration-150',
                    active ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong',
                  )}
                >
                  {status ? TRACKER_STATUS_LABEL[status] : 'Semua'}
                  <span className={cn('font-mono text-xs', active ? 'text-on-brand/70' : 'text-ink-muted')}>{count}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-line-strong px-6 py-14 text-center">
            <BookmarkCheck aria-hidden className="size-8 text-ink-muted" />
            <h2 className="text-xl font-semibold">Belum ada kegiatan yang kamu lacak</h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              Buka halaman kegiatan dan tekan &ldquo;Simpan ke Tracker&rdquo; pada lomba, beasiswa, atau magang yang ingin kamu ikuti.
            </p>
            <Link href="/events" className="mt-2 flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
              Jelajahi kegiatan
            </Link>
          </div>
        ) : (
          <section aria-label={filter ? `Tahap ${TRACKER_STATUS_LABEL[filter]}` : 'Semua pendaftaran'} className="rounded-[18px] border border-line px-5 sm:px-6">
            {shown.map((item) => (
              <TrackerCard key={item.id} item={item} returnTo={returnTo} />
            ))}
            {shown.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">Tidak ada kegiatan di tahap ini.</p>}
          </section>
        )}
      </div>
    </AccountShell>
  );
}
