import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookmarkCheck, Clock, Plus, Send, Trophy, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { TrackerCard } from '@/components/tracker/tracker-card';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
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
          <span aria-hidden className="flex size-12 items-center justify-center rounded-[14px] bg-brand text-on-brand">
            <Clock className="size-5" />
          </span>
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
  const nextUp = items
    .filter((item) => item.status === 'SAVED' && item.event.primaryDeadlineAt && (daysUntil(item.event.primaryDeadlineAt, now) ?? -1) >= 0)
    .sort(byDeadline)[0];
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
            {nextUp?.event.primaryDeadlineAt ? (
              <Link href={`/tracker/${nextUp.event.slug}`} className="flex min-w-0 flex-col gap-1 bg-inverse px-5 py-4 text-on-inverse transition-opacity duration-150 hover:opacity-90 [grid-column:span_2]">
                <span className="font-mono text-[11px] tracking-[.08em] text-on-inverse-muted">BELUM DAFTAR · TERDEKAT</span>
                <span className="truncate text-[15px] font-semibold">{nextUp.event.title}</span>
                <span className="text-[13px] text-on-inverse-muted">
                  Tutup {formatDateId(nextUp.event.primaryDeadlineAt)} · {daysLeftLabel(daysUntil(nextUp.event.primaryDeadlineAt, now)).toLowerCase()}
                </span>
              </Link>
            ) : null}
          </div>
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
