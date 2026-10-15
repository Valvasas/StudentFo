import type { ReactNode } from 'react';
import { Ban, Check, ChevronDown, CircleCheck, CircleX, ExternalLink, Hourglass, ImageOff, ReceiptText, type LucideIcon } from 'lucide-react';
import { reviewRegistrationAction } from '@/app/penyelenggara/acara/[id]/pendaftar/actions';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatRupiah } from '@/lib/currency';
import { formatDateTimeId, formatShortDateId } from '@/lib/deadline';
import { formatAnswer, REGISTRATION_FORM_LIMITS, registrationTransition, type ReviewDecision } from '@/lib/registration-form';
import { cn } from '@/lib/utils';
import { REGISTRATION_STATUS_LABEL, type AnswerValue, type EventRegistration, type FormField, type RegistrationStatus } from '@/types/domain';

const STATUS_META: Record<RegistrationStatus, { variant: NonNullable<BadgeProps['variant']>; icon: LucideIcon }> = {
  AWAITING_PAYMENT: { variant: 'neutral', icon: Hourglass },
  PAYMENT_REVIEW: { variant: 'warning', icon: ReceiptText },
  CONFIRMED: { variant: 'success', icon: CircleCheck },
  REJECTED: { variant: 'danger', icon: CircleX },
  CANCELLED: { variant: 'outline', icon: Ban },
};

/** Status pendaftaran selalu ikon + teks — warna saja tidak cukup. */
export function RegistrationStatusBadge({ status, className }: { status: RegistrationStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} className={cn('whitespace-nowrap', className)}>
      <meta.icon aria-hidden className="size-3.5 shrink-0" />
      {REGISTRATION_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Kolom tabel di layar lebar; di ponsel tiap baris jadi kartu. Satu sumber supaya kepala & baris tidak bergeser. */
export function registrationGridClass(showFee: boolean): string {
  return showFee
    ? 'lg:grid-cols-[minmax(0,1.6fr)_11.5rem_8rem_6.5rem_5rem_1.25rem]'
    : 'lg:grid-cols-[minmax(0,1.6fr)_11.5rem_8rem_5rem_1.25rem]';
}

export function RegistrationListHeader({ showFee }: { showFee: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'hidden gap-x-4 border-b border-line px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.04em] text-ink-muted lg:grid',
        registrationGridClass(showFee),
      )}
    >
      <span>Peserta</span>
      <span>Status</span>
      <span>Kode</span>
      {showFee && <span>Biaya</span>}
      <span>Daftar</span>
      <span />
    </div>
  );
}

const DECISION_LABEL: Record<ReviewDecision, string> = {
  confirm: 'Konfirmasi pembayaran',
  reject_payment: 'Tolak bukti',
  reject: 'Tolak pendaftaran',
};

/**
 * Satu pendaftar: baris ringkas (`<summary>`) yang membuka jawaban, bukti
 * bayar, dan aksi panitia. Aksi yang ditampilkan = yang diizinkan
 * `registrationTransition()` untuk status saat ini; repository tetap
 * memeriksa ulang (status bisa sudah berubah di tab lain).
 */
export function RegistrationRow({
  registration,
  fields,
  eventId,
  returnTo,
  showFee,
  open,
  feedback,
}: {
  registration: EventRegistration;
  fields: readonly FormField[];
  eventId: string;
  returnTo: string;
  showFee: boolean;
  open: boolean;
  /** Hasil aksi terakhir untuk baris ini (ditampilkan di dalam baris, bukan di atas halaman). */
  feedback?: ReactNode;
}) {
  const { status } = registration;
  const fee = registration.feeAmount ? formatRupiah(registration.feeAmount) : 'Gratis';
  const known = new Set(fields.map((field) => field.id));
  const extra = Object.entries(registration.answers).filter(([id]) => !known.has(id));
  const hasPayment = registration.feeAmount !== null || registration.proofUploadedAt !== null;
  const canConfirm = registrationTransition(status, 'confirm') !== null;
  const canRejectPayment = registrationTransition(status, 'reject_payment') !== null;
  const canReject = registrationTransition(status, 'reject') !== null;
  const form = { registrationId: registration.id, eventId, returnTo };

  return (
    <li id={`pendaftar-${registration.id}`} className="scroll-mt-24">
      <details open={open} className="group">
        {/* Dua susunan: kartu di layar sempit, baris tabel di layar lebar. Yang
            tersembunyi `display: none`, jadi pembaca layar hanya membaca satu. */}
        <summary className="block cursor-pointer list-none px-4 py-3.5 transition-colors duration-150 ease-snap hover:bg-panel-nested/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col gap-2.5 lg:hidden">
            <span className="flex items-start justify-between gap-3">
              <Person registration={registration} />
              <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[13px] text-ink-muted">
                <span className="sr-only">Mendaftar </span>
                {formatShortDateId(registration.createdAt)}
                <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-180" />
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <RegistrationStatusBadge status={status} />
              <Code value={registration.code} />
            </span>
          </span>
          <span className={cn('hidden items-center gap-x-4 lg:grid', registrationGridClass(showFee))}>
            <Person registration={registration} />
            <span>
              <RegistrationStatusBadge status={status} />
            </span>
            <Code value={registration.code} />
            {showFee && (
              <span className="text-sm tabular-nums">
                <span className="sr-only">Biaya </span>
                {fee}
              </span>
            )}
            <span className="text-sm text-ink-muted">
              <span className="sr-only">Mendaftar </span>
              {formatShortDateId(registration.createdAt)}
            </span>
            <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-180" />
          </span>
        </summary>

        <div className="grid gap-6 border-t border-line bg-panel-nested/40 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          {feedback && <div className="lg:col-span-2">{feedback}</div>}

          <div className="flex min-w-0 flex-col gap-5">
            <AnswerList title="Jawaban" entries={fields.map((field) => ({ key: field.id, label: field.label, field, value: registration.answers[field.id] }))} />
            {extra.length > 0 && (
              <AnswerList
                title="Jawaban lain"
                hint="Dari pertanyaan yang sudah dihapus dari formulir."
                entries={extra.map(([id, value]) => ({ key: id, label: id, field: null, value }))}
                mono
              />
            )}
            <p className="text-[12.5px] text-ink-muted">Mendaftar {formatDateTimeId(registration.createdAt)}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {hasPayment && <PaymentPanel registration={registration} fee={fee} />}
            {registration.reviewNote && (
              <p className="rounded-card border border-line bg-panel px-3.5 py-3 text-sm text-ink-soft">
                <span className="font-semibold text-ink">Catatan panitia: </span>
                {registration.reviewNote}
              </p>
            )}

            {(canConfirm || canRejectPayment || canReject) && (
              <div className="flex flex-col gap-2.5">
                {canConfirm && (
                  <form action={reviewRegistrationAction}>
                    <HiddenInputs {...form} decision="confirm" />
                    <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ className: 'w-full' })}>
                      <Check aria-hidden />
                      {status === 'PAYMENT_REVIEW' ? DECISION_LABEL.confirm : 'Tandai lunas'}
                    </SubmitButton>
                  </form>
                )}
                {canRejectPayment && (
                  <ReasonForm
                    {...form}
                    decision="reject_payment"
                    summary="Tolak bukti"
                    note="Peserta diminta mengunggah bukti baru."
                    placeholder="Mis. nominal kurang, atau foto bukti tidak terbaca."
                  />
                )}
                {canReject && (
                  <ReasonForm
                    {...form}
                    decision="reject"
                    summary="Tolak pendaftaran"
                    note="Final: peserta tidak bisa mendaftar lagi ke acara ini."
                    placeholder="Mis. tidak memenuhi syarat jenjang peserta."
                    subtle
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

function Person({ registration }: { registration: EventRegistration }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-semibold">{registration.fullName}</span>
      <span className="truncate text-[13px] text-ink-muted">{registration.email}</span>
    </span>
  );
}

function Code({ value }: { value: string }) {
  return (
    <span className="font-mono text-[12.5px] text-ink-soft">
      <span className="sr-only">Kode </span>
      {value}
    </span>
  );
}

interface AnswerEntry {
  readonly key: string;
  readonly label: string;
  readonly field: FormField | null;
  readonly value: AnswerValue | undefined;
}

function AnswerList({ title, hint, entries, mono = false }: { title: string; hint?: string; entries: readonly AnswerEntry[]; mono?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-[12.5px] text-ink-muted">{hint}</p>}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.key} className={cn('flex min-w-0 flex-col gap-0.5', entry.field?.type === 'long_text' && 'sm:col-span-2')}>
            <dt className={cn('text-[12.5px] text-ink-muted', mono && 'font-mono')}>{entry.label}</dt>
            <dd className="whitespace-pre-line break-words text-[14.5px]">
              <AnswerValueText field={entry.field} value={entry.value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AnswerValueText({ field, value }: { field: FormField | null; value: AnswerValue | undefined }) {
  const text = formatAnswer(value);
  if (!text) return <span className="text-ink-faint">Tidak diisi</span>;
  // Tautan hanya bila memang http(s): jawaban lama/asing tidak boleh jadi `javascript:`.
  if (field?.type === 'url' && typeof value === 'string' && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-[3px] hover:no-underline">
        {value}
      </a>
    );
  }
  return <>{text}</>;
}

function PaymentPanel({ registration, fee }: { registration: EventRegistration; fee: string }) {
  const proofHref = `/media/bukti/${encodeURIComponent(registration.id)}`;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Pembayaran</h3>
        <span className="font-semibold tabular-nums">{fee}</span>
      </div>
      {registration.proofUploadedAt ? (
        <figure className="flex flex-col gap-2">
          <a href={proofHref} target="_blank" rel="noopener" className="block overflow-hidden rounded-sm border border-line bg-panel-nested">
            {/* eslint-disable-next-line @next/next/no-img-element -- berkas privat lewat rute ber-otorisasi, bukan aset yang bisa dioptimasi */}
            <img
              src={proofHref}
              alt={`Bukti pembayaran ${registration.fullName}`}
              loading="lazy"
              decoding="async"
              className="mx-auto max-h-72 w-auto object-contain"
            />
          </a>
          <figcaption className="flex flex-wrap items-center justify-between gap-x-3 text-[12.5px] text-ink-muted">
            <span>
              {registration.status === 'AWAITING_PAYMENT' ? 'Bukti terakhir, ditolak · ' : ''}
              Diunggah {formatDateTimeId(registration.proofUploadedAt)}
            </span>
            <a href={proofHref} target="_blank" rel="noopener" className="flex min-h-11 items-center gap-1 font-medium text-ink underline underline-offset-[3px] hover:no-underline">
              Buka ukuran penuh <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(tab baru)</span>
            </a>
          </figcaption>
        </figure>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ImageOff aria-hidden className="size-4 shrink-0" />
          Belum ada bukti pembayaran.
        </p>
      )}
    </section>
  );
}

function HiddenInputs({ registrationId, eventId, returnTo, decision }: { registrationId: string; eventId: string; returnTo: string; decision: ReviewDecision }) {
  return (
    <>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="decision" value={decision} />
    </>
  );
}

function ReasonForm({
  registrationId,
  eventId,
  returnTo,
  decision,
  summary,
  note,
  placeholder,
  subtle = false,
}: {
  registrationId: string;
  eventId: string;
  returnTo: string;
  decision: Exclude<ReviewDecision, 'confirm'>;
  summary: string;
  note: string;
  placeholder: string;
  subtle?: boolean;
}) {
  const inputId = `catatan-${decision}-${registrationId}`;
  return (
    <details className="group/reason">
      <summary
        className={cn(
          'list-none [&::-webkit-details-marker]:hidden',
          subtle
            ? 'flex min-h-11 w-fit cursor-pointer items-center gap-1.5 text-sm font-medium text-danger underline-offset-[3px] hover:underline'
            : buttonVariants({ variant: 'secondary', className: 'w-full cursor-pointer' }),
        )}
      >
        {summary}
        <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open/reason:rotate-180" />
      </summary>
      <form action={reviewRegistrationAction} className="mt-2 flex flex-col gap-2.5 rounded-card border border-danger-line bg-panel p-3.5">
        <HiddenInputs registrationId={registrationId} eventId={eventId} returnTo={returnTo} decision={decision} />
        <label htmlFor={inputId} className="text-[13.5px] font-semibold">
          Alasan untuk peserta (wajib)
        </label>
        <TextArea
          id={inputId}
          name="note"
          rows={3}
          required
          maxLength={REGISTRATION_FORM_LIMITS.noteMax}
          placeholder={placeholder}
          aria-describedby={`${inputId}-hint`}
        />
        <p id={`${inputId}-hint`} className="text-[12.5px] text-ink-muted">
          {note}
        </p>
        <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ variant: 'danger', className: 'self-start' })}>
          {decision === 'reject' ? 'Ya, tolak pendaftaran' : DECISION_LABEL.reject_payment}
        </SubmitButton>
      </form>
    </details>
  );
}
