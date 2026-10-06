import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Circle, ListChecks, MessageSquareQuote, Undo2 } from 'lucide-react';
import { cancelRegistrationAction } from '@/app/events/[slug]/pendaftaran/actions';
import { AddToCalendarButton } from '@/components/event/add-to-calendar-button';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Ticket } from '@/components/registration/ticket';
import { DraftCleaner, PrintTicketButton } from '@/components/registration/ticket-tools';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Confetti } from '@/components/ui/feature-illustrations';
import { HandNote } from '@/components/ui/sketch';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { canParticipantCancel, displayPhone, registrationGate } from '@/lib/registration';
import { registrationDraftKey, stampLabelOf, ticketAgenda, ticketPlace, ticketTint } from '@/lib/registration-view';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, type Registration, type RegistrationStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tiket pendaftaran',
  robots: { index: false, follow: false },
};

const HEADLINE: Record<RegistrationStatus, { note: string; lead: string; mark: string; tail: string }> = {
  CONFIRMED: { note: 'sampai jumpa di sana!', lead: 'Kamu', mark: 'terdaftar', tail: '.' },
  PENDING: { note: 'tinggal satu langkah', lead: 'Pendaftaranmu', mark: 'sedang ditinjau', tail: '.' },
  WAITLISTED: { note: 'jangan ke mana-mana', lead: 'Kamu di', mark: 'daftar tunggu', tail: '.' },
  REJECTED: { note: 'terima kasih sudah mencoba', lead: 'Pendaftaranmu', mark: 'belum diterima', tail: '.' },
  CANCELLED: { note: 'pendaftaran dibatalkan', lead: 'Kursimu sudah', mark: 'dilepas', tail: '.' },
};

function leadText(registration: Registration, organizer: string): string {
  switch (registration.status) {
    case 'CONFIRMED':
      return 'Tunjukkan kode tiket ini ke panitia saat registrasi ulang. Kabar berikutnya dari panitia masuk ke notifikasimu.';
    case 'PENDING':
      return `${organizer} meninjau setiap pendaftar. Begitu ada keputusan, kamu dikabari lewat lonceng notifikasi — tidak perlu cek berkala.`;
    case 'WAITLISTED':
      return `Kamu urutan ke-${registration.waitlistPosition ?? '?'}. Begitu ada kursi kosong, kamu naik otomatis dan dikabari — tanpa mendaftar ulang.`;
    case 'REJECTED':
      return 'Keputusan panitia untuk kegiatan ini sudah final. Masih banyak peluang serupa yang terbuka.';
    case 'CANCELLED':
      return 'Kursimu sudah diberikan ke orang berikutnya. Selama pendaftaran masih buka, kamu bisa mendaftar lagi — dengan kode tiket yang sama, antre dari belakang.';
  }
}

interface Milestone {
  readonly label: string;
  readonly detail: string;
  readonly state: 'done' | 'current' | 'todo' | 'off';
}

function milestones(registration: Registration, manual: boolean): Milestone[] {
  const sent: Milestone = { label: 'Pendaftaran terkirim', detail: formatDateTimeId(registration.createdAt), state: 'done' };
  switch (registration.status) {
    case 'PENDING':
      return [sent, { label: 'Ditinjau panitia', detail: 'Sedang berlangsung', state: 'current' }, { label: 'Tiket aktif', detail: 'Setelah dikonfirmasi', state: 'todo' }];
    case 'WAITLISTED':
      return [
        sent,
        { label: `Antre urutan ke-${registration.waitlistPosition ?? '?'}`, detail: 'Naik otomatis saat kursi kosong', state: 'current' },
        ...(manual ? [{ label: 'Ditinjau panitia', detail: 'Setelah naik dari antrean', state: 'todo' as const }] : []),
        { label: 'Tiket aktif', detail: 'Kamu dikabari lewat notifikasi', state: 'todo' },
      ];
    case 'CONFIRMED':
      return [
        sent,
        ...(manual || registration.decidedAt
          ? [{ label: 'Dikonfirmasi panitia', detail: registration.decidedAt ? formatDateTimeId(registration.decidedAt) : 'Selesai', state: 'done' as const }]
          : []),
        { label: 'Tiket aktif', detail: 'Tunjukkan kode saat registrasi ulang', state: 'current' },
      ];
    case 'REJECTED':
      return [sent, { label: 'Keputusan panitia', detail: registration.decidedAt ? formatDateTimeId(registration.decidedAt) : 'Selesai', state: 'off' }];
    case 'CANCELLED':
      return [sent, { label: 'Dibatalkan olehmu', detail: 'Kursi diberikan ke antrean berikutnya', state: 'off' }];
  }
}

/**
 * Tiket pendaftaran langsung (ADR-055). Satu halaman untuk semua status —
 * kalimat utama, cap di tiket, dan linimasa berubah mengikuti status,
 * supaya peserta tidak perlu menebak "ini artinya apa".
 *
 * Konfeti & cap yang "dijatuhkan" hanya muncul tepat setelah mengirim
 * (`?notice=registration_submitted`), dan konfeti hanya untuk yang langsung
 * terdaftar — merayakan "masuk daftar tunggu" terasa mengejek. Pesan
 * konfirmasi panitia (sering berisi tautan grup) hanya untuk yang
 * terkonfirmasi.
 */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/events/${encodeURIComponent(slug)}/pendaftaran/tiket`);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) notFound();

  const detailPath = `/events/${event.slug}`;
  const formPath = `${detailPath}/pendaftaran`;
  const [registration, form] = await Promise.all([repository.getMyRegistration(user.id, event.id), repository.getRegistrationForm(event.id)]);
  if (!registration) redirect(formPath);

  const now = new Date();
  const fresh = firstParam(query.notice) === 'registration_submitted';
  const headline = HEADLINE[registration.status];
  const active = registration.status !== 'REJECTED' && registration.status !== 'CANCELLED';
  const canRegisterAgain = registration.status === 'CANCELLED' && registrationGate(form, event, now).ok;
  const steps = milestones(registration, form?.reviewMode === 'MANUAL');
  const details = [
    { label: 'WhatsApp', value: displayPhone(registration.phone) },
    { label: 'Institusi', value: registration.institution },
    ...(registration.major ? [{ label: 'Jurusan', value: registration.major }] : []),
    { label: 'Jenjang', value: EDUCATION_LEVEL_LABEL[registration.educationLevel] },
    ...(registration.team ? [{ label: 'Tim', value: `${registration.team.title} — ${registration.team.members.join(', ')}` }] : []),
    ...registration.answers.map((answer) => ({ label: answer.label, value: answer.value })),
  ];

  return (
    <div className="container-page max-w-[960px] pb-24 pt-6 sm:pt-8">
      <DraftCleaner storageKey={registrationDraftKey(event.id)} />
      <Link href={detailPath} className="mb-4 flex min-h-11 w-fit max-w-full items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink print:hidden">
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{event.title}</span>
      </Link>

      <ActionFeedback params={query} className="mb-6 max-w-2xl print:hidden" />

      <header className="enter flex flex-col gap-3 [animation-duration:900ms]">
        <HandNote className="text-[22px] text-ink-muted print:hidden">{headline.note}</HandNote>
        <h1 className="-mt-1 text-[clamp(34px,5vw,54px)] leading-[1]">
          {headline.lead} <span className="marker">{headline.mark}</span>
          {headline.tail}
        </h1>
        <p className="max-w-[60ch] text-[16px] leading-relaxed text-ink-muted">{leadText(registration, event.organizer)}</p>
      </header>

      <div className="relative mt-8">
        {fresh && registration.status === 'CONFIRMED' && (
          // Wadah terpotong sendiri: konfeti yang terbang ke samping tidak boleh melebarkan halaman di ponsel.
          <span aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <Confetti />
          </span>
        )}
        <Ticket
          eventTitle={event.title}
          organizer={event.organizer}
          eventType={event.eventType}
          when={ticketAgenda(event, now)}
          where={ticketPlace(event)}
          holder={registration.fullName}
          institution={registration.institution}
          team={registration.team?.title ?? null}
          code={registration.code}
          status={registration.status}
          stampLabel={stampLabelOf(registration.status, registration.waitlistPosition)}
          tint={ticketTint(event)}
          animate={fresh}
          className={cn('rise', !active && 'opacity-80')}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
        {active && <AddToCalendarButton event={event} now={now} />}
        {registration.status === 'CONFIRMED' && <PrintTicketButton />}
        {canRegisterAgain && (
          <Link href={formPath} className={buttonVariants({ size: 'md' })}>
            <Undo2 aria-hidden /> Daftar lagi
          </Link>
        )}
        <Link href="/tracker" className={buttonVariants({ variant: 'ghost' })}>
          <ListChecks aria-hidden /> Lihat di Pelacak
        </Link>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="linimasa" className="flex flex-col gap-4">
            <h2 id="linimasa" className="text-[20px] font-bold tracking-[-0.02em]">
              Perjalanan pendaftaranmu
            </h2>
            <ol className="flex flex-col">
              {steps.map((step, index) => (
                <li key={step.label} className="rise grid grid-cols-[28px_minmax(0,1fr)] gap-3" style={{ '--i': index + 2 } as CSSProperties}>
                  <span aria-hidden className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-pill border-2',
                        step.state === 'done' && 'border-ink bg-ink text-on-brand',
                        step.state === 'current' && 'border-ink bg-highlight text-on-highlight',
                        step.state === 'todo' && 'border-dashed border-line-strong bg-panel text-ink-muted',
                        step.state === 'off' && 'border-line-strong bg-panel-nested text-ink-muted',
                      )}
                    >
                      {step.state === 'done' ? <Check className="size-3.5" /> : <Circle className={cn('size-2', step.state === 'current' && 'fill-current')} />}
                    </span>
                    {index < steps.length - 1 && <span className={cn('min-h-6 w-0.5 flex-1', step.state === 'done' ? 'bg-ink' : 'bg-line')} />}
                  </span>
                  <span className="flex flex-col gap-0.5 pb-6">
                    <span className={cn('text-[15px] font-semibold leading-snug', step.state === 'todo' && 'text-ink-muted')}>
                      {step.label}
                      {step.state === 'current' && <span className="sr-only"> (tahap saat ini)</span>}
                    </span>
                    <span className="text-[13px] text-ink-muted">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {registration.status === 'CONFIRMED' && form?.confirmationNote && (
            <section aria-labelledby="pesan-panitia" className="flex gap-3.5 rounded-[20px] border border-line bg-panel p-5">
              <Avatar name={event.organizer} seed={event.id} size="sm" shape="square" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 id="pesan-panitia" className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                  <MessageSquareQuote aria-hidden className="size-4 text-ink-muted" /> Pesan dari panitia
                </h2>
                <p className="whitespace-pre-line break-words text-[14.5px] leading-relaxed text-ink-soft">{form.confirmationNote}</p>
              </div>
            </section>
          )}

          {registration.status === 'REJECTED' && registration.decisionNote && (
            <section aria-labelledby="catatan-panitia" className="flex flex-col gap-1.5 rounded-[20px] border border-line bg-panel-nested p-5">
              <h2 id="catatan-panitia" className="text-[14.5px] font-semibold">
                Catatan panitia
              </h2>
              <p className="whitespace-pre-line break-words text-[14.5px] leading-relaxed text-ink-soft">{registration.decisionNote}</p>
            </section>
          )}

          {!active && (
            <Link href={`/events?type=${event.eventType}`} className="group flex min-h-11 items-center gap-1.5 self-start text-[14.5px] font-semibold underline underline-offset-4 print:hidden">
              Lihat peluang serupa yang masih buka
              <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="isian" className="flex flex-col gap-3">
            <h2 id="isian" className="text-[20px] font-bold tracking-[-0.02em]">
              Yang kamu kirim
            </h2>
            <dl className="divide-y divide-line rounded-[20px] border border-line bg-panel">
              {details.map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
                  <dt className="shrink-0 text-[13px] text-ink-muted sm:w-[38%]">{item.label}</dt>
                  <dd className="min-w-0 whitespace-pre-line break-words text-[14px] font-medium leading-snug">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              Hanya kamu dan panitia {event.organizer} yang bisa melihat data ini. Perlu mengubahnya? Batalkan lalu daftar lagi selama pendaftaran masih buka.
            </p>
          </section>

          {canParticipantCancel(registration.status) && (
            <details className="group rounded-[16px] border border-line print:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
                Batalkan pendaftaran
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-90" />
              </summary>
              <form action={cancelRegistrationAction} className="flex flex-col gap-3 border-t border-line p-4">
                <input type="hidden" name="slug" value={event.slug} />
                <p className="text-[13.5px] leading-relaxed text-ink-muted">
                  Kursimu langsung diberikan ke orang berikutnya di daftar tunggu dan tidak bisa dikembalikan. Kamu masih bisa mendaftar lagi selama pendaftaran buka, tetapi
                  antre dari belakang.
                </p>
                <SubmitButton className={buttonVariants({ variant: 'danger', className: 'self-start' })}>Ya, batalkan pendaftaranku</SubmitButton>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
