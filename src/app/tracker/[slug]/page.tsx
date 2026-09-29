import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, CalendarClock, Check, FileText, History, ListChecks, NotebookPen, Users } from 'lucide-react';
import { updateTrackerStatusAction } from '@/app/tracker/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { AccountShell } from '@/components/layout/account-shell';
import { DemoDocumentsSummary } from '@/components/profile/demo-detail-cards';
import { PortfolioPanel } from '@/components/tracker/portfolio-form';
import { TrackerRemoveForm, TrackerStatusForm, TrackerSteps } from '@/components/tracker/tracker-card';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId, formatDateTimeId, getDeadlineState } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import type { RawSearchParams } from '@/lib/search-params';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import { DEADLINE_LABEL_TEXT, EVENT_TYPE_LABEL, TRACKER_STATUS_LABEL, remainingSlots, type TrackerStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Status pendaftaran',
  robots: { index: false, follow: false },
};

function Panel({ id, icon, title, children, className }: { id: string; icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3 rounded-[18px] border border-line p-5 sm:p-6', className)}>
      <h2 id={id} className="flex items-center gap-2.5 text-base font-semibold">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-[9px] bg-panel-nested">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function QuickStatus({ eventId, status, returnTo, children, primary = false }: { eventId: string; status: TrackerStatus; returnTo: string; children: ReactNode; primary?: boolean }) {
  return (
    <form action={updateTrackerStatusAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className={cn(
          'flex h-11 items-center gap-1.5 rounded-card px-3.5 text-sm font-semibold transition-colors duration-150',
          primary ? 'bg-brand text-on-brand hover:bg-brand-hover' : 'border border-line-strong/70 hover:bg-panel-nested',
        )}
      >
        {children}
      </button>
    </form>
  );
}

/**
 * Status pendaftaran (kanvas Status Pendaftaran).
 *
 * Kanvas menggambarkan pendaftaran yang dikirim LEWAT StudentHub: nomor
 * pendaftaran, berkas "sedang dicek", persetujuan anggota. StudentFo
 * mengarahkan ke situs penyelenggara, jadi yang tampil di sini adalah yang
 * benar-benar kita tahu: tahap yang kamu catat, jadwal resmi kegiatan,
 * catatanmu, dan tim yang kamu ikuti (ADR-039).
 */
export default async function TrackerStatusPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const returnTo = `/tracker/${slug}`;
  const user = await requireUser(returnTo);
  const repository = await getEventRepository();
  const [items, event] = await Promise.all([repository.listTrackerItems(user.id), repository.getEventBySlug(slug)]);
  const item = items.find((entry) => entry.event.slug === slug);
  if (!item || !event) notFound();

  const teams = event.eventType === 'LOMBA' ? await repository.listTeams(event.id) : [];
  const myTeam = teams.find((team) => team.members.some((member) => member.userId === user.id));
  const openTeams = teams.filter((team) => team !== myTeam && remainingSlots(team) > 0).length;

  const now = new Date();
  const deadline = getDeadlineState(event.primaryDeadlineAt, now);
  const isClosed = deadline.urgency === 'closed' || event.status === 'EXPIRED';
  const registrationUrl = sanitizeExternalUrl(event.registrationLink);
  const schedule = [...event.deadlines].sort((left, right) => left.deadlineAt.localeCompare(right.deadlineAt));
  const nextDate = schedule.find((entry) => (daysUntil(entry.deadlineAt, now) ?? -1) >= 0);

  const todos: { title: string; text: string; action?: ReactNode }[] = [];
  if (item.status === 'SAVED') {
    if (isClosed) {
      todos.push({ title: 'Pendaftaran sudah ditutup', text: 'Kalau kamu sempat mendaftar, tandai supaya riwayatnya lengkap.' });
    } else {
      todos.push({
        title: event.primaryDeadlineAt ? `Daftar sebelum ${formatDateId(event.primaryDeadlineAt)}` : 'Daftar di situs penyelenggara',
        text: `${daysLeftLabel(event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null)}. Pendaftaran dilakukan di situs resmi ${event.organizer}.`,
        action: registrationUrl ? (
          <a
            href={`/events/${event.slug}/daftar`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex h-11 items-center gap-1.5 rounded-card bg-brand px-3.5 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover"
          >
            Buka formulir resmi <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(tab baru)</span>
          </a>
        ) : undefined,
      });
    }
    todos.push({
      title: 'Sudah mendaftar?',
      text: 'Tandai supaya pengingat berpindah ke jadwal seleksi.',
      action: (
        <QuickStatus eventId={event.id} status="APPLIED" returnTo={returnTo}>
          <Check aria-hidden className="size-4" /> Tandai sudah daftar
        </QuickStatus>
      ),
    });
  } else if (item.status === 'APPLIED') {
    todos.push({
      title: 'Tunggu kabar dari penyelenggara',
      text: nextDate ? `Jadwal berikutnya: ${DEADLINE_LABEL_TEXT[nextDate.label]}, ${formatDateId(nextDate.deadlineAt)}.` : 'Belum ada jadwal berikutnya yang diumumkan.',
      action: (
        <QuickStatus eventId={event.id} status="INTERVIEW" returnTo={returnTo}>
          Lolos ke tahap seleksi
        </QuickStatus>
      ),
    });
  } else if (item.status === 'INTERVIEW') {
    todos.push({
      title: 'Catat hasil seleksi',
      text: 'Begitu hasilnya keluar, tandai di sini supaya riwayatmu lengkap.',
      action: (
        <div className="flex flex-wrap gap-2">
          <QuickStatus eventId={event.id} status="ACCEPTED" returnTo={returnTo} primary>
            Diterima
          </QuickStatus>
          <QuickStatus eventId={event.id} status="REJECTED" returnTo={returnTo}>
            Belum berhasil
          </QuickStatus>
        </div>
      ),
    });
  }
  if (event.eventType === 'LOMBA' && !myTeam && item.status !== 'ACCEPTED' && item.status !== 'REJECTED') {
    todos.push({
      title: 'Belum punya tim',
      text: openTeams > 0 ? `${openTeams} tim untuk lomba ini masih mencari anggota.` : 'Belum ada tim yang mencari anggota. Kamu bisa membuat tim sendiri.',
      action: (
        <Link href={`/teams?kegiatan=${event.slug}`} className="flex h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-3.5 text-sm font-semibold hover:bg-panel-nested">
          Cari tim <ArrowRight aria-hidden className="size-4" />
        </Link>
      ),
    });
  }

  const history = [
    ...(item.updatedAt !== item.createdAt ? [{ title: `Tahap diubah ke “${TRACKER_STATUS_LABEL[item.status]}”`, time: item.updatedAt }] : []),
    { title: 'Disimpan ke Pendaftaran', time: item.createdAt },
  ];

  return (
    <AccountShell user={user} active="daftar">
      <div className="flex flex-col gap-6">
        <Link href="/tracker" className="-mb-2 flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Semua pendaftaran
        </Link>

        <header className="enter flex flex-col gap-3 [animation-duration:800ms]">
          <span className="font-mono text-xs tracking-[.08em] text-ink-muted">PROSES PENDAFTARAN · {EVENT_TYPE_LABEL[event.eventType].toUpperCase()}</span>
          <h1 className="max-w-[24ch] text-[clamp(28px,4vw,40px)] leading-[1.08] tracking-[-0.04em]">{event.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13.5px] text-ink-muted">
            <span className="inline-flex h-7 items-center rounded-sm bg-brand px-2.5 text-[13px] font-semibold text-on-brand">{TRACKER_STATUS_LABEL[item.status]}</span>
            <span>Disimpan {formatDateId(item.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>{event.organizer}</span>
            <span aria-hidden>·</span>
            <Link href={`/events/${event.slug}`} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-[3px] sm:min-h-0">
              Detail kegiatan
            </Link>
          </p>
        </header>

        <ActionFeedback params={query} className="max-w-2xl" />

        <div className="enter rounded-[18px] border border-line p-5 [animation-delay:80ms] [animation-duration:800ms] sm:p-6">
          <TrackerSteps item={item} />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel id="todo-title" icon={<ListChecks className="size-4" />} title="Perlu kamu lakukan">
              {todos.length > 0 ? (
                <ul className="flex flex-col">
                  {todos.map((todo) => (
                    <li key={todo.title} className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 py-3.5 first:border-t-0 first:pt-0">
                      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">{todo.title}</span>
                        <span className="text-[13.5px] leading-snug text-ink-muted">{todo.text}</span>
                      </span>
                      {todo.action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2.5 rounded-card bg-panel-nested px-3.5 py-3 text-sm">
                  <Check aria-hidden className="size-4" /> Tidak ada yang perlu dilakukan sekarang.
                </p>
              )}
            </Panel>

            <Panel id="catatan-title" icon={<NotebookPen className="size-4" />} title="Catatan">
              <form action={updateTrackerStatusAction} className="flex flex-col gap-3">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="status" value={item.status} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label htmlFor="notes" className="sr-only">
                  Catatan untuk {event.title}
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  maxLength={500}
                  defaultValue={item.notes ?? ''}
                  placeholder="Contoh: berkas dikirim lewat email panitia, nomor peserta 0417."
                  className="resize-y rounded-card border border-line-strong/70 bg-panel px-3.5 py-3 text-base leading-[1.55] hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                />
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink-muted">Hanya kamu yang bisa membaca catatan ini. Maksimal 500 karakter.</span>
                  <button type="submit" className="flex h-11 items-center rounded-card bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover">
                    Simpan catatan
                  </button>
                </span>
              </form>
            </Panel>

            <Panel id="portofolio-title" icon={<Award className="size-4" />} title="Portofolio">
              <PortfolioPanel item={item} returnTo={returnTo} />
            </Panel>

            <Panel id="riwayat-title" icon={<History className="size-4" />} title="Riwayat">
              <ol className="flex flex-col">
                {history.map((entry) => (
                  <li key={entry.title} className="relative flex flex-col gap-0.5 border-l border-line py-2 pl-5 before:absolute before:-left-[5px] before:top-3.5 before:size-[9px] before:rounded-full before:bg-brand before:content-['']">
                    <span className="text-sm font-semibold">{entry.title}</span>
                    <span className="text-[12.5px] text-ink-muted">{formatDateTimeId(entry.time)}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[92px]">
            <Panel id="jadwal-title" icon={<CalendarClock className="size-4" />} title="Jadwal kegiatan">
              {schedule.length > 0 ? (
                <ol className="flex flex-col">
                  {schedule.map((entry) => {
                    const days = daysUntil(entry.deadlineAt, now);
                    const past = (days ?? 0) < 0;
                    return (
                      <li key={entry.id} className={cn('flex items-baseline justify-between gap-3 border-t border-line/70 py-2.5 first:border-t-0', past && 'text-ink-muted')}>
                        <span className="text-sm font-medium">
                          {DEADLINE_LABEL_TEXT[entry.label]}
                          {past && <span className="sr-only"> (sudah lewat)</span>}
                        </span>
                        <span className="text-right text-[13px]">
                          {formatDateId(entry.deadlineAt)}
                          {!past && <span className="block text-[12px] text-ink-muted">{daysLeftLabel(days)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-ink-muted">Penyelenggara belum mengumumkan jadwal.</p>
              )}
            </Panel>

            {event.eventType === 'LOMBA' && (
              <Panel id="tim-title" icon={<Users className="size-4" />} title={myTeam ? myTeam.title : 'Tim'}>
                {myTeam ? (
                  <>
                    <ul className="flex flex-col">
                      {myTeam.members.map((member) => (
                        <li key={member.userId} className="flex items-center justify-between gap-3 border-t border-line/70 py-2.5 first:border-t-0">
                          <span className="text-sm font-medium">
                            {member.fullName}
                            {member.userId === user.id && ' (kamu)'}
                          </span>
                          <span className="text-[12.5px] text-ink-muted">{member.role === 'leader' ? 'Ketua' : 'Anggota'}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href={`/teams/${myTeam.id}`} className="flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                      Buka halaman tim
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">Kamu belum bergabung dengan tim untuk lomba ini.</p>
                )}
              </Panel>
            )}

            {demoFeaturesEnabled && (
              <Panel id="berkas-title" icon={<FileText className="size-4" />} title="Dokumen siap pakai">
                <DemoDocumentsSummary />
                <Link href="/profile/details#dokumen" className="flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-semibold underline underline-offset-[3px]">
                  Kelola dokumen
                </Link>
              </Panel>
            )}

            <section aria-labelledby="ubah-title" className="flex flex-col gap-3 rounded-[18px] bg-panel-nested p-5">
              <h2 id="ubah-title" className="text-sm font-semibold">
                Ubah tahap manual
              </h2>
              <TrackerStatusForm item={item} returnTo={returnTo} />
              <TrackerRemoveForm item={item} returnTo="/tracker" withLabel />
            </section>
          </div>
        </div>
      </div>
    </AccountShell>
  );
}
