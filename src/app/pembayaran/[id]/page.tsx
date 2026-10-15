import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Ban, ChevronDown, CircleX, ExternalLink, MessageSquareText, ShieldAlert } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { RegistrationStatusBadge } from '@/components/organizer/registration-row';
import { CopyCodeButton } from '@/components/registration/copy-code-button';
import { registrationHref } from '@/components/registration/registration-cta';
import { RegistrationSteps } from '@/components/registration/registration-steps';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { registrationSteps } from '@/components/registration/registration-view';
import { buttonVariants } from '@/components/ui/button';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser, toEventActor } from '@/lib/auth';
import { formatRupiah } from '@/lib/currency';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { formatAnswer, registrationTransition } from '@/lib/registration-form';
import { parseActionErrorCode, parseActionNoticeCode } from '@/lib/action-feedback';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { EventRegistration, FormField, RegistrationForm, RegistrationStatus } from '@/types/domain';
import { cancelRegistrationAction, submitPaymentProofAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pendaftaran',
  robots: { index: false, follow: false },
};

const card = 'flex min-w-0 flex-col gap-5 rounded-[20px] border border-line bg-panel p-5 sm:p-6';
const sectionTitle = 'text-[18px] font-bold tracking-[-0.02em]';

function statusLine(registration: EventRegistration): string {
  switch (registration.status) {
    case 'AWAITING_PAYMENT':
      return registration.proofUploadedAt
        ? 'Bukti sebelumnya belum diterima panitia. Baca catatannya, lalu unggah bukti baru.'
        : 'Transfer sesuai nominal, lalu unggah buktinya.';
    case 'PAYMENT_REVIEW':
      return 'Panitia sedang memeriksa buktimu. Kabar berikutnya masuk ke notifikasi.';
    case 'CONFIRMED':
      return 'Kamu terdaftar. Tunjukkan kode ini bila panitia memintanya.';
    case 'REJECTED':
      return 'Panitia tidak menerima pendaftaran ini.';
    case 'CANCELLED':
      return 'Pendaftaran ini sudah kamu batalkan.';
  }
}

/**
 * Satu pendaftaran milik peserta (ADR-056): kode, tahap, pembayaran, jawaban.
 *
 * Hanya PEMILIK yang dilayani di sini. Repository juga mengembalikan
 * pendaftaran untuk pengelola acara & admin, tapi mereka bekerja di studio —
 * halaman ini berisi aksi milik peserta (unggah bukti, batalkan) yang akan
 * ditolak repository untuk orang lain; menampilkannya ke mereka hanya
 * menyesatkan. Bukan pemilik = 404, sama dengan id yang tidak ada.
 */
export default async function RegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const self = registrationHref(id);
  const user = await requireUser(self);
  const repository = await getEventRepository();
  const registration = await repository.getRegistration(toEventActor(user), id);
  if (!registration || registration.userId !== user.id) notFound();

  let form: RegistrationForm | null = null;
  try {
    form = await repository.getRegistrationForm(registration.event.id);
  } catch (error) {
    console.error('[pembayaran] formulir gagal dimuat:', error);
  }

  const fee = registration.feeAmount ?? 0;
  const steps = registrationSteps(registration.status, fee > 0);
  const canUpload = fee > 0 && registrationTransition(registration.status, 'submit_proof') !== null;
  const canCancel = registrationTransition(registration.status, 'cancel') !== null;
  const eventPath = `/events/${registration.event.slug}`;
  const showPayment = fee > 0 && registration.status !== 'CANCELLED' && registration.status !== 'REJECTED';

  return (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        <Link href="/pembayaran" className="flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Pembayaran
        </Link>

        <ActionFeedback params={query} />
        {(parseActionNoticeCode(query.notice) || parseActionErrorCode(query.error)) && <ScrollToTop key={randomUUID()} />}

        <header className="flex flex-col gap-2.5">
          <RegistrationStatusBadge status={registration.status} className="self-start" />
          <h1 className="text-[clamp(26px,4.2vw,36px)] leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">{registration.event.title}</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-[15px] text-ink-soft">
            {registration.event.organizer}
            <Link href={eventPath} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
              Lihat acara
            </Link>
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="kode-pendaftaran" className={card}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 id="kode-pendaftaran" className="text-[13.5px] font-semibold text-ink-muted">
                    Kode pendaftaran
                  </h2>
                  <p className="select-all break-all font-mono text-[clamp(24px,5vw,30px)] font-bold tracking-[0.04em]">{registration.code}</p>
                </div>
                <CopyCodeButton code={registration.code} />
              </div>
              {steps ? <RegistrationSteps steps={steps} /> : <EndedState status={registration.status} />}
              <p className="text-[14.5px] leading-relaxed text-ink-soft">{statusLine(registration)}</p>
              {registration.status === 'CANCELLED' && (
                <Link href={`${eventPath}/formulir`} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
                  Daftar lagi <ArrowRight aria-hidden />
                </Link>
              )}
              {registration.reviewNote && (
                <ReviewNote tone={registration.status === 'CONFIRMED' ? 'neutral' : 'caution'}>{registration.reviewNote}</ReviewNote>
              )}
            </section>

            {showPayment && (
              <section aria-labelledby="pembayaran" className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="pembayaran" className={sectionTitle}>
                    Pembayaran
                  </h2>
                  <span className="text-[26px] font-bold tabular-nums tracking-[-0.02em]">{formatRupiah(fee)}</span>
                </div>

                {registration.status === 'CONFIRMED' ? (
                  <p className="text-[14.5px] text-ink-soft">
                    Lunas{registration.reviewedAt ? ` — dikonfirmasi panitia ${formatDateTimeId(registration.reviewedAt)}` : ''}.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <h3 className="text-[13.5px] font-semibold">Instruksi dari {registration.event.organizer}</h3>
                      <p className="whitespace-pre-line break-words rounded-card bg-panel-nested p-4 text-[15px] leading-relaxed">
                        {form?.paymentInstructions ?? 'Instruksi pembayaran belum tersedia. Hubungi penyelenggara sebelum mentransfer.'}
                      </p>
                    </div>
                    <p role="note" className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-soft">
                      <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" />
                      <span>
                        Bayar hanya ke tujuan yang tertulis di halaman ini. StudentFo tidak pernah meminta OTP, PIN, atau kata sandi.
                      </span>
                    </p>
                  </>
                )}

                {registration.proofUploadedAt && <ProofPreview registration={registration} />}

                {canUpload &&
                  (registration.status === 'PAYMENT_REVIEW' ? (
                    <details className="group rounded-card border border-line">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                        Salah unggah? Ganti bukti
                        <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-line p-4">
                        <ProofForm registrationId={registration.id} returnTo={self} label="Bukti pengganti" />
                      </div>
                    </details>
                  ) : (
                    <ProofForm
                      registrationId={registration.id}
                      returnTo={self}
                      label={registration.proofUploadedAt ? 'Bukti pembayaran baru' : 'Bukti pembayaran'}
                    />
                  ))}
              </section>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="data-pendaftaran" className={card}>
              <h2 id="data-pendaftaran" className={sectionTitle}>
                Data pendaftaran
              </h2>
              <Answers registration={registration} fields={form?.fields ?? []} />
              <p className="text-[12.5px] text-ink-muted">Terdaftar {formatDateTimeId(registration.createdAt)}</p>
            </section>

            {canCancel && <CancelRegistration registrationId={registration.id} returnTo={self} paid={fee > 0} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EndedState({ status }: { status: RegistrationStatus }) {
  const Icon = status === 'REJECTED' ? CircleX : Ban;
  return (
    <p className="flex items-center gap-2.5 rounded-card bg-panel-nested px-4 py-3 text-[15px] font-semibold">
      <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
      {status === 'REJECTED' ? 'Pendaftaran ditolak' : 'Pendaftaran dibatalkan'}
    </p>
  );
}

function ReviewNote({ tone, children }: { tone: 'caution' | 'neutral'; children: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2.5 rounded-card border px-4 py-3 text-sm leading-relaxed',
        tone === 'caution' ? 'border-caution-line bg-caution-soft text-caution' : 'border-line bg-panel-nested text-ink-soft',
      )}
    >
      <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0">
        <strong className="block font-semibold">Catatan panitia</strong>
        <span className="whitespace-pre-line break-words">{children}</span>
      </p>
    </div>
  );
}

function ProofPreview({ registration }: { registration: EventRegistration }) {
  // Versi di URL: setelah bukti diganti, pengalihan Server Action tetap di dokumen yang sama dan
  // peramban memakai ulang gambar lama untuk URL yang sama (walau `no-store`).
  const src = `/media/bukti/${encodeURIComponent(registration.id)}?v=${Date.parse(registration.proofUploadedAt ?? '') || 0}`;
  const rejected = registration.status === 'AWAITING_PAYMENT';
  return (
    <figure className="flex flex-col gap-2">
      <a href={src} target="_blank" rel="noopener" className="block overflow-hidden rounded-card border border-line bg-panel-nested">
        {/* eslint-disable-next-line @next/next/no-img-element -- berkas privat lewat rute ber-otorisasi, bukan aset yang bisa dioptimasi */}
        <img
          src={src}
          alt={rejected ? 'Bukti pembayaran sebelumnya' : 'Bukti pembayaran yang kamu unggah'}
          loading="lazy"
          decoding="async"
          className="mx-auto max-h-72 w-auto object-contain"
        />
      </a>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 text-[12.5px] text-ink-muted">
        <span>
          {rejected ? 'Bukti sebelumnya · ' : 'Bukti terkirim · '}
          {formatDateTimeId(registration.proofUploadedAt ?? registration.updatedAt)}
        </span>
        <a href={src} target="_blank" rel="noopener" className="flex min-h-11 items-center gap-1 font-medium text-ink underline underline-offset-[3px] hover:no-underline">
          Buka ukuran penuh <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(tab baru)</span>
        </a>
      </figcaption>
    </figure>
  );
}

function ProofForm({ registrationId, returnTo, label }: { registrationId: string; returnTo: string; label: string }) {
  return (
    <form action={submitPaymentProofAction} className="flex flex-col gap-4">
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <ImageUploadField id="proof" name="proof" label={label} hint="Foto atau tangkapan layar bukti transfer. Maks. 5 MB." required />
      <SubmitButton pendingLabel="Mengunggah…" className={buttonVariants({ className: 'w-full sm:w-auto sm:self-start' })}>
        Kirim bukti pembayaran
      </SubmitButton>
    </form>
  );
}

function Answers({ registration, fields }: { registration: EventRegistration; fields: readonly FormField[] }) {
  const rows = [
    { label: 'Nama', value: registration.fullName },
    { label: 'Email', value: registration.email },
    ...fields.flatMap((field) => {
      const answer = registration.answers[field.id];
      return answer === undefined ? [] : [{ label: field.label, value: formatAnswer(answer) }];
    }),
  ];
  return (
    <dl className="flex flex-col gap-3.5">
      {rows.map((row, index) => (
        <div key={`${index}-${row.label}`} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12.5px] text-ink-muted">{row.label}</dt>
          <dd className="whitespace-pre-line break-words text-[15px]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CancelRegistration({ registrationId, returnTo, paid }: { registrationId: string; returnTo: string; paid: boolean }) {
  return (
    <details className="group rounded-[20px] border border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        Batalkan pendaftaran
        <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-180" />
      </summary>
      <form action={cancelRegistrationAction} className="flex flex-col gap-4 border-t border-line p-5">
        <input type="hidden" name="registrationId" value={registrationId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-sm leading-relaxed text-ink-soft">
          {paid && 'Biaya yang sudah dibayar mengikuti kebijakan panitia — StudentFo tidak memegang dana. '}
          Tempatmu dilepas untuk pendaftar lain.
        </p>
        <SubmitButton pendingLabel="Membatalkan…" className={buttonVariants({ variant: 'danger', className: 'w-full sm:w-auto sm:self-start' })}>
          Ya, batalkan pendaftaran
        </SubmitButton>
      </form>
    </details>
  );
}
