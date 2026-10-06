import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check, Download, ExternalLink, Mail, MessageCircle, RotateCcw, Search, X } from 'lucide-react';
import { decideRegistrationAction } from '@/app/penyelenggara/registration-actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { NotManaging } from '@/components/organizer/not-managing';
import { StudioEventHeader } from '@/components/organizer/studio-event-header';
import { RegistrationStatusChip } from '@/components/registration/status-chip';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { TextArea, TextInput } from '@/components/ui/field';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { HourglassSketch } from '@/components/ui/feature-illustrations';
import { SubmitButton } from '@/components/ui/submit-button';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { daysAgoLabel } from '@/lib/network';
import { decideTransition, displayPhone, formatTicketCode, REGISTRATION_LIMITS, type RegistrationDecision } from '@/lib/registration';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import {
  EDUCATION_LEVEL_LABEL,
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_STATUSES,
  type Registration,
  type RegistrationForm,
  type RegistrationSeats,
  type RegistrationStatus,
} from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pendaftar',
  robots: { index: false, follow: false },
};

const PAGE = 100;

interface ListState {
  readonly status: RegistrationStatus | null;
  readonly q: string;
  readonly r: string | null;
  readonly n: number;
}

function matches(registration: Registration, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const code = needle.replace(/[\s-]/g, '').toUpperCase();
  return (
    registration.fullName.toLowerCase().includes(needle) ||
    registration.institution.toLowerCase().includes(needle) ||
    registration.email.toLowerCase().includes(needle) ||
    (code.length >= 4 && registration.code.includes(code)) ||
    (registration.team?.title.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * Pendaftar satu acara (ADR-055): daftar + panel detail berdampingan, semua
 * keadaan di URL (`?status=`, `?q=`, `?r=`) — tautan bisa dikirim ke rekan
 * panitia dan bekerja tanpa JS. Setelah memutuskan, panel pindah ke
 * pendaftar BERIKUTNYA di daftar yang sama: meninjau 40 orang jadi satu
 * alur, bukan 40 kali klik-kembali-cari.
 */
export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const base = `/penyelenggara/acara/${encodeURIComponent(id)}`;
  const selfPath = `${base}/pendaftar`;
  const user = await requireUser(selfPath);

  const statusRaw = firstParam(query.status);
  const state: ListState = {
    status: (REGISTRATION_STATUSES as readonly string[]).includes(statusRaw ?? '') ? (statusRaw as RegistrationStatus) : null,
    q: (firstParam(query.q) ?? '').trim().slice(0, 80),
    r: firstParam(query.r) ?? null,
    n: Math.min(Math.max(Number(firstParam(query.n)) || PAGE, PAGE), REGISTRATION_LIMITS.listMax),
  };
  const href = (patch: Partial<ListState>) => {
    const next = { ...state, ...patch };
    return withQuery(selfPath, {
      status: next.status ?? undefined,
      q: next.q || undefined,
      r: next.r ?? undefined,
      n: next.n > PAGE ? String(next.n) : undefined,
    });
  };

  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === id);
  if (!managed) return <NotManaging />;

  const loaded = await Promise.all([
    repository.getManagedRegistrationForm(user.id, id),
    repository.listRegistrations(user.id, id),
    repository.getRegistrationSeats(id),
  ]).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, code: toActionErrorCode(error) }),
  );
  if (!loaded.ok && loaded.code === 'not_event_manager') return <NotManaging />;
  const [form, registrations, seats] = loaded.ok ? loaded.value : [null, [], { capacity: null, taken: 0, waitlisted: 0 }];

  const counts = Object.fromEntries(REGISTRATION_STATUSES.map((status) => [status, registrations.filter((item) => item.status === status).length])) as Record<
    RegistrationStatus,
    number
  >;
  const filtered = registrations.filter((item) => (!state.status || item.status === state.status) && matches(item, state.q));
  const shown = filtered.slice(0, state.n);
  const selectedIndex = state.r ? filtered.findIndex((item) => item.id === state.r) : -1;
  const selected = selectedIndex >= 0 ? filtered[selectedIndex]! : state.r ? (registrations.find((item) => item.id === state.r) ?? null) : null;
  const next = selectedIndex >= 0 ? (filtered[selectedIndex + 1] ?? filtered[selectedIndex - 1] ?? null) : null;

  const tabs: { status: RegistrationStatus | null; label: string; count: number }[] = [
    { status: null, label: 'Semua', count: registrations.length },
    ...REGISTRATION_STATUSES.map((status) => ({ status, label: REGISTRATION_STATUS_LABEL[status], count: counts[status] })),
  ];

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <StudioEventHeader event={managed.event} active="pendaftar" pending={counts.PENDING} />
      <ActionFeedback params={query} className="max-w-2xl" />

      {!loaded.ok ? (
        <p role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
          Daftar pendaftar belum bisa dimuat. Muat ulang halaman sebentar lagi.
        </p>
      ) : !form ? (
        <p className="rounded-[20px] border border-dashed border-line-strong bg-panel p-6 text-[15px] text-ink-muted">
          Acara ini belum memakai pendaftaran langsung.{' '}
          <Link href={`${base}/pendaftaran/formulir`} className="font-semibold text-ink underline underline-offset-4">
            Susun formulirnya
          </Link>{' '}
          untuk mulai menerima pendaftar di StudentFo.
        </p>
      ) : registrations.length === 0 ? (
        <section className="grid items-center gap-8 rounded-[28px] border border-line bg-panel p-6 sm:p-9 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-3">
            <h2 className="text-[24px] font-bold tracking-[-0.03em]">Belum ada pendaftar</h2>
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
              {form.status === 'OPEN'
                ? 'Pendaftar pertama akan muncul di sini — lengkap dengan kontak, jawaban, dan tombol keputusan.'
                : 'Buka pendaftaran dari tab Performa pendaftaran supaya peserta bisa mulai mendaftar.'}
            </p>
          </div>
          <IllustrationStage tint="peach" className="min-h-[180px]">
            <HourglassSketch />
          </IllustrationStage>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Saring status" className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
              <ul className="flex min-w-max gap-1.5">
                {tabs.map((tab) => {
                  const current = tab.status === state.status;
                  return (
                    <li key={tab.label}>
                      <Link
                        href={href({ status: tab.status, r: null, n: PAGE })}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'flex h-10 items-center gap-1.5 rounded-pill border px-3.5 text-[13.5px] font-medium transition-colors duration-150 ease-snap',
                          current ? 'border-ink bg-ink text-on-brand' : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
                        )}
                      >
                        {tab.label}
                        <span className={cn('font-mono text-[12px]', current ? 'text-on-brand/80' : 'text-ink-muted')}>{tab.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <form action={selfPath} method="get" role="search" className="flex items-center gap-1.5">
                {state.status && <input type="hidden" name="status" value={state.status} />}
                <label htmlFor="cari-pendaftar" className="sr-only">
                  Cari nama, institusi, email, atau kode tiket
                </label>
                <TextInput id="cari-pendaftar" name="q" defaultValue={state.q} placeholder="Cari nama, institusi, kode…" maxLength={80} className="h-10 w-[min(260px,60vw)]" />
                <button type="submit" aria-label="Cari" className={buttonVariants({ variant: 'secondary', size: 'icon', className: 'size-10 min-h-10' })}>
                  <Search aria-hidden />
                </button>
              </form>
              <a href={`${selfPath}/ekspor`} download className={buttonVariants({ variant: 'secondary', className: 'h-10 min-h-10' })}>
                <Download aria-hidden /> Ekspor CSV
              </a>
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
            <section aria-label="Daftar pendaftar" className={cn('flex min-w-0 flex-col gap-3', selected && 'max-lg:hidden')}>
              <p className="text-[13px] text-ink-muted" role="status">
                {filtered.length === registrations.length ? `${filtered.length} pendaftar` : `${filtered.length} dari ${registrations.length} pendaftar`}
                {state.q && ` cocok dengan “${state.q}”`}
              </p>
              {filtered.length === 0 ? (
                <p className="rounded-[18px] border border-dashed border-line-strong p-6 text-center text-[14px] text-ink-muted">
                  Tidak ada pendaftar dengan saringan ini.{' '}
                  <Link href={href({ status: null, q: '', r: null })} className="font-semibold text-ink underline underline-offset-4">
                    Tampilkan semua
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-panel">
                  {shown.map((registration, index) => {
                    const active = registration.id === selected?.id;
                    return (
                      <li key={registration.id} className="rise border-b border-line last:border-b-0" style={{ '--i': Math.min(index, 10) } as CSSProperties}>
                        <Link
                          href={href({ r: registration.id })}
                          scroll={false}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 ease-snap',
                            active ? 'bg-highlight-soft' : 'hover:bg-panel-nested',
                          )}
                        >
                          <Avatar name={registration.fullName} seed={registration.userId} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[14.5px] font-semibold">
                              {registration.fullName}
                              {registration.team && <span className="font-normal text-ink-muted"> · {registration.team.title}</span>}
                            </span>
                            <span className="truncate text-[12.5px] text-ink-muted">
                              {registration.institution} · {EDUCATION_LEVEL_LABEL[registration.educationLevel]} · {daysAgoLabel(registration.createdAt)}
                            </span>
                          </span>
                          <span className="hidden font-mono text-[12px] text-ink-muted sm:inline">{formatTicketCode(registration.code)}</span>
                          <RegistrationStatusChip status={registration.status} position={registration.waitlistPosition} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {filtered.length > shown.length && (
                <Link href={href({ n: state.n + PAGE })} scroll={false} className={buttonVariants({ variant: 'secondary', className: 'self-center' })}>
                  Tampilkan {Math.min(PAGE, filtered.length - shown.length)} lagi
                </Link>
              )}
            </section>

            {selected ? (
              <RegistrationPanel
                registration={selected}
                form={form}
                seats={seats}
                eventId={id}
                closeHref={href({ r: null })}
                returnTo={href({ r: next?.id ?? null })}
                selfHref={href({})}
              />
            ) : (
              <aside className="hidden flex-col items-center gap-3 rounded-[24px] border border-dashed border-line-strong p-8 text-center lg:sticky lg:top-24 lg:flex">
                <span aria-hidden className="flex size-12 items-center justify-center rounded-[14px] bg-panel-nested">
                  <Check className="size-5" />
                </span>
                <p className="text-[15px] font-semibold">Pilih pendaftar untuk melihat detail</p>
                <p className="max-w-[34ch] text-[13.5px] leading-relaxed text-ink-muted">
                  {counts.PENDING > 0
                    ? `${counts.PENDING} pendaftar menunggu keputusanmu. Setelah memutuskan, panel langsung pindah ke pendaftar berikutnya.`
                    : 'Kontak, jawaban, dan tombol keputusan tampil di sini.'}
                </p>
                {counts.PENDING > 0 && state.status !== 'PENDING' && (
                  <Link href={href({ status: 'PENDING', r: registrations.find((item) => item.status === 'PENDING')?.id ?? null })} className={buttonVariants({ size: 'md', className: 'mt-1' })}>
                    Mulai meninjau
                  </Link>
                )}
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DecisionButton({
  decision,
  registrationId,
  eventId,
  returnTo,
  variant,
  children,
}: {
  decision: RegistrationDecision;
  registrationId: string;
  eventId: string;
  returnTo: string;
  variant: 'primary' | 'secondary' | 'success';
  children: ReactNode;
}) {
  return (
    <form action={decideRegistrationAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton className={buttonVariants({ variant, className: 'w-full' })}>{children}</SubmitButton>
    </form>
  );
}

function RegistrationPanel({
  registration,
  form,
  seats,
  eventId,
  closeHref,
  returnTo,
  selfHref,
}: {
  registration: Registration;
  form: RegistrationForm;
  seats: RegistrationSeats;
  eventId: string;
  closeHref: string;
  returnTo: string;
  selfHref: string;
}) {
  const can = (decision: RegistrationDecision) => decideTransition(registration.status, decision, form, seats) !== null;
  const whatsapp = `https://wa.me/${registration.phone.replace(/^\+/, '')}`;
  const facts = [
    { label: 'Institusi', value: registration.institution },
    ...(registration.major ? [{ label: 'Jurusan', value: registration.major }] : []),
    { label: 'Jenjang', value: EDUCATION_LEVEL_LABEL[registration.educationLevel] },
    { label: 'Mendaftar', value: formatDateTimeId(registration.createdAt) },
    ...(registration.decidedAt ? [{ label: 'Diputuskan', value: formatDateTimeId(registration.decidedAt) }] : []),
  ];

  return (
    <aside
      aria-labelledby="detail-pendaftar"
      className="fade-in flex flex-col gap-5 rounded-[24px] border border-line bg-panel p-5 sm:p-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
    >
      <Link href={closeHref} scroll={false} className="-mt-1 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink lg:hidden">
        <ArrowLeft aria-hidden className="size-4" /> Kembali ke daftar
      </Link>
      <div className="flex items-start gap-3.5">
        <Avatar name={registration.fullName} seed={registration.userId} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 id="detail-pendaftar" className="text-[19px] font-bold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">
            {registration.fullName}
          </h2>
          <span className="flex flex-wrap items-center gap-2">
            <RegistrationStatusChip status={registration.status} position={registration.waitlistPosition} />
            <span className="font-mono text-[12.5px] text-ink-muted">{formatTicketCode(registration.code)}</span>
          </span>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Tutup detail" className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-mr-2 -mt-2 max-lg:hidden' })}>
          <X aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', className: 'min-w-0' })}>
          <MessageCircle aria-hidden /> <span className="truncate">{displayPhone(registration.phone)}</span>
          <span className="sr-only">(WhatsApp, tab baru)</span>
        </a>
        <a href={`mailto:${registration.email}`} className={buttonVariants({ variant: 'secondary', className: 'min-w-0' })}>
          <Mail aria-hidden /> <span className="truncate">Email</span>
          <span className="sr-only"> {registration.email}</span>
        </a>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13.5px]">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-ink-muted">{fact.label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {registration.team && (
        <div className="flex flex-col gap-2 rounded-[16px] bg-panel-nested p-4">
          <span className="text-[13px] font-semibold">Tim · {registration.team.title}</span>
          <ul className="flex flex-wrap gap-1.5">
            {registration.team.members.map((member, index) => (
              <li key={`${member}-${index}`} className="rounded-pill bg-panel px-2.5 py-1 text-[12.5px] font-medium">
                {member}
                {index === 0 && <span className="text-ink-muted"> · ketua</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {form.questions.length > 0 && (
        <section aria-label="Jawaban" className="flex flex-col gap-3 border-t border-line pt-4">
          {form.questions.map((question) => {
            const answer = registration.answers.find((item) => item.questionId === question.id);
            const link = question.kind === 'URL' && answer ? sanitizeExternalUrl(answer.value) : null;
            return (
              <div key={question.id} className="flex flex-col gap-1">
                <span className="text-[12.5px] font-semibold text-ink-muted">{answer?.label ?? question.label}</span>
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex min-h-11 items-center gap-1 text-[14px] font-medium underline underline-offset-4 [overflow-wrap:anywhere]">
                    {answer!.value} <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                    <span className="sr-only">(tab baru)</span>
                  </a>
                ) : (
                  <p className={cn('whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]', !answer && 'text-ink-muted')}>{answer?.value ?? 'Tidak diisi'}</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {registration.decisionNote && (
        <p className="rounded-[14px] bg-panel-nested p-3.5 text-[13px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Catatan untuk peserta:</span> {registration.decisionNote}
        </p>
      )}

      {/* Menempel di dasar panel (desktop): jawaban panjang tidak mendorong tombol keputusan keluar layar. */}
      <section
        aria-label="Keputusan"
        className="flex flex-col gap-2.5 border-t border-line pt-4 lg:sticky lg:-bottom-6 lg:-mx-6 lg:-mb-6 lg:bg-panel lg:px-6 lg:pb-6 lg:shadow-[0_-14px_18px_-16px_rgba(29,27,23,0.25)]"
      >
        {registration.status === 'CANCELLED' ? (
          <p className="text-[13.5px] text-ink-muted">Dibatalkan oleh peserta — kursinya sudah diberikan ke antrean.</p>
        ) : (
          <>
            {can('CONFIRM') && (
              <DecisionButton decision="CONFIRM" registrationId={registration.id} eventId={eventId} returnTo={returnTo} variant="primary">
                <Check aria-hidden /> {registration.status === 'WAITLISTED' ? 'Konfirmasi dari antrean' : 'Konfirmasi'}
              </DecisionButton>
            )}
            {registration.status === 'WAITLISTED' && !can('CONFIRM') && (
              <p className="text-[12.5px] leading-relaxed text-ink-muted">Kursi penuh. Naikkan kuota di tab Formulir untuk mengonfirmasi dari antrean — antrean juga naik otomatis.</p>
            )}
            {can('REOPEN') && (
              <DecisionButton decision="REOPEN" registrationId={registration.id} eventId={eventId} returnTo={selfHref} variant="secondary">
                <RotateCcw aria-hidden /> Buka lagi pendaftarannya
              </DecisionButton>
            )}
            {can('REJECT') && (
              <details className="group rounded-[14px] border border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-[14px] font-semibold text-danger [&::-webkit-details-marker]:hidden">
                  {registration.status === 'CONFIRMED' ? 'Batalkan konfirmasi & tolak' : 'Tolak pendaftaran'}
                  <X aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-90" />
                </summary>
                <form action={decideRegistrationAction} className="flex flex-col gap-2.5 border-t border-line p-3.5">
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="registrationId" value={registration.id} />
                  <input type="hidden" name="decision" value="REJECT" />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label htmlFor={`catatan-${registration.id}`} className="text-[13px] font-medium">
                    Catatan untuk peserta <span className="font-normal text-ink-muted">(opsional, ikut dikirim di notifikasi)</span>
                  </label>
                  <TextArea id={`catatan-${registration.id}`} name="note" rows={3} maxLength={REGISTRATION_LIMITS.decisionNoteMax} placeholder="Mis. kuota divisi data sudah penuh — coba lagi di batch berikutnya." />
                  <SubmitButton className={buttonVariants({ variant: 'danger' })}>Tolak & kabari peserta</SubmitButton>
                </form>
              </details>
            )}
            <p className="text-[12px] leading-relaxed text-ink-muted">Peserta dikabari otomatis lewat notifikasi StudentFo setiap kali kamu memutuskan.</p>
          </>
        )}
      </section>
    </aside>
  );
}
