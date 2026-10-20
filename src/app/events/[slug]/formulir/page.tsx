import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Ban, CalendarClock, CircleSlash, Eye, Lock, PencilLine, Ticket, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { loadManagedEvent, workspacePath } from '@/components/organizer/event-workspace';
import { registrationHref } from '@/components/registration/registration-cta';
import { RegistrationFieldInput } from '@/components/registration/registration-field-input';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { CONSENT_FIELD, invalidFieldFrom, registrationEventClosed } from '@/components/registration/registration-view';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { parseActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { formatRupiah } from '@/lib/currency';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { sectionTitle } from '@/lib/page-title';
import { registrationAvailability, type RegistrationAvailability } from '@/lib/registration-form';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn, sanitizeExternalUrl } from '@/lib/utils';
import { registerForEventAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await (await getEventRepository()).getEventBySlug((await params).slug);
  return {
    title: event ? sectionTitle('Formulir pendaftaran', event.title) : 'Formulir pendaftaran',
    robots: { index: false, follow: false },
  };
}

const card = 'flex flex-col gap-5 rounded-[20px] border border-line bg-panel p-5 sm:p-7';

/**
 * Formulir pendaftaran internal untuk peserta (ADR-056).
 *
 * Satu layar, satu tujuan: identitas dari akun (terkunci — penyelenggara
 * tidak pernah membaca tabel `users`, jadi yang mereka terima adalah salinan
 * ini), pertanyaan panitia, persetujuan berbagi data, kirim. Pendaftar yang
 * sudah terdaftar langsung diarahkan ke pendaftarannya.
 *
 * Pengelola acara melihat PRATINJAU dengan tombol kirim nonaktif: kiriman
 * dari akun panitia sendiri ikut memakan kuota, muncul di ekspor CSV, dan
 * mengacaukan angka di studio — sementara yang ingin mereka lihat hanyalah
 * rupa formulirnya. Isian tetap bisa dicoba supaya validasinya terasa.
 */
export default async function RegistrationFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) notFound();

  const eventPath = `/events/${event.slug}`;
  const user = await requireUser(`${eventPath}/formulir`);
  const [form, mine, managed] = await Promise.all([
    repository.getRegistrationForm(event.id),
    repository.getMyRegistration(user.id, event.id),
    loadManagedEvent(user, event.id),
  ]);
  const preview = managed !== null;
  if (mine && !preview) redirect(registrationHref(mine.id));

  const availability = registrationAvailability(form, registrationEventClosed(event));
  if (!form || (!availability.open && !preview)) {
    return (
      <Unavailable
        reason={form ? availability.reason : 'form_closed'}
        eventPath={eventPath}
        officialHref={sanitizeExternalUrl(event.registrationLink) ? `${eventPath}/daftar` : null}
        studioHref={preview ? workspacePath(event.id, 'formulir') : null}
      />
    );
  }

  const error = parseActionErrorCode(query.error);
  const invalidField = error === 'invalid_registration' ? invalidFieldFrom(firstParam(query.kolom), form.fields) : null;
  const fee = form.feeAmount;

  return (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <div className="mx-auto flex max-w-[680px] flex-col gap-6">
        <Link href={eventPath} className="flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke acara
        </Link>

        {preview && <PreviewRibbon availability={availability} studioHref={workspacePath(event.id, 'formulir')} />}
        <ActionFeedback params={query} />
        {/* Kolom yang salah sudah difokuskan (dan digulir ke layar) lewat autoFocus — jangan direbut. */}
        {error && !invalidField && <ScrollToTop key={randomUUID()} />}

        <header className="flex flex-col gap-3">
          <p className="text-[13.5px] font-semibold text-ink-muted">Formulir pendaftaran</p>
          <h1 className="text-[clamp(26px,4.2vw,36px)] leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">{event.title}</h1>
          <p className="text-[15px] text-ink-soft">{event.organizer}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {event.primaryDeadlineAt && (
              <Fact icon={<CalendarClock aria-hidden className="size-4 text-ink-muted" />}>Tutup {formatDateTimeId(event.primaryDeadlineAt)}</Fact>
            )}
            <Fact icon={<Ticket aria-hidden className="size-4 text-ink-muted" />}>
              <span className="sr-only">Biaya: </span>
              {fee ? formatRupiah(fee) : 'Gratis'}
            </Fact>
            {availability.remaining !== null && (
              <Fact icon={<Users aria-hidden className="size-4 text-ink-muted" />}>Sisa kuota {availability.remaining.toLocaleString('id-ID')}</Fact>
            )}
          </ul>
        </header>

        {form.intro && <p className="whitespace-pre-line text-[15.5px] leading-[1.7] text-ink-soft">{form.intro}</p>}

        <form action={registerForEventAction} className="flex flex-col gap-6">
          <input type="hidden" name="slug" value={event.slug} />
          <input type="hidden" name="eventId" value={event.id} />

          <section aria-labelledby="data-akun" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 id="data-akun" className="text-[18px] font-bold tracking-[-0.02em]">
                Data akun
              </h2>
              <Link
                href="/profile/details"
                className="flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
              >
                <PencilLine aria-hidden className="size-3.5" /> Ubah nama
              </Link>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <LockedValue label="Nama lengkap" value={user.fullName} />
              <LockedValue label="Email" value={user.email} />
            </dl>
          </section>

          {form.fields.length > 0 && (
            <section aria-labelledby="pertanyaan" className={cn(card, 'gap-7')}>
              <h2 id="pertanyaan" className="text-[18px] font-bold tracking-[-0.02em]">
                Pertanyaan dari penyelenggara
              </h2>
              {form.fields.map((field) => (
                <RegistrationFieldInput key={field.id} field={field} invalid={invalidField === field.id} />
              ))}
            </section>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 text-[14.5px] leading-snug text-ink-soft',
                  invalidField === CONSENT_FIELD && 'text-danger',
                )}
              >
                <input
                  type="checkbox"
                  name={CONSENT_FIELD}
                  required
                  aria-invalid={invalidField === CONSENT_FIELD || undefined}
                  autoFocus={invalidField === CONSENT_FIELD}
                  className="check mt-0.5"
                />
                <span>
                  Data di formulir ini dibagikan ke <strong className="font-semibold text-ink">{event.organizer}</strong> untuk keperluan
                  pendaftaran.
                </span>
              </label>
            </div>
            <SubmitButton
              disabled={preview}
              pendingLabel="Mengirim…"
              className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto sm:self-start' })}
            >
              {fee ? (
                <>
                  Daftar & lanjut ke pembayaran
                  <span aria-hidden className="opacity-60">·</span>
                  {formatRupiah(fee)}
                </>
              ) : (
                'Kirim pendaftaran'
              )}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {icon}
      <span>{children}</span>
    </li>
  );
}

function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-[13.5px] font-semibold">{label}</dt>
      <dd className="flex min-h-11 min-w-0 items-center gap-2 rounded-card bg-panel-nested px-3.5 py-2 text-base text-ink-soft">
        <Lock aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        {/* Tidak dipotong: peserta harus bisa membaca utuh alamat yang akan dibagikan ke panitia. */}
        <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
      </dd>
    </div>
  );
}

const AVAILABILITY_NOTE: Record<NonNullable<RegistrationAvailability['reason']>, string> = {
  form_closed: 'Formulir sedang nonaktif — peserta belum bisa mendaftar.',
  event_closed: 'Tenggat sudah lewat — peserta tidak bisa mendaftar lagi.',
  full: 'Kuota sudah penuh — peserta tidak bisa mendaftar lagi.',
};

function PreviewRibbon({ availability, studioHref }: { availability: RegistrationAvailability; studioHref: string }) {
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-info-line bg-info-soft px-4 py-3 text-sm text-info">
      <Eye aria-hidden className="size-4 shrink-0" />
      <p className="min-w-[200px] flex-1 leading-snug">
        <strong className="font-semibold">Pratinjau penyelenggara.</strong> Tombol kirim dinonaktifkan supaya pratinjau tidak masuk ke
        daftar pendaftar.
        {availability.reason && <> {AVAILABILITY_NOTE[availability.reason]}</>}
      </p>
      <Link href={studioHref} className="flex min-h-11 items-center gap-1 font-semibold underline underline-offset-[3px] hover:no-underline">
        Sunting formulir
      </Link>
    </div>
  );
}

const UNAVAILABLE: Record<NonNullable<RegistrationAvailability['reason']>, { title: string; body: string; icon: typeof Ban }> = {
  form_closed: {
    title: 'Pendaftaran lewat StudentFo belum dibuka',
    body: 'Penyelenggara belum membuka formulir di StudentFo untuk acara ini.',
    icon: CircleSlash,
  },
  event_closed: { title: 'Pendaftaran sudah ditutup', body: 'Tenggat pendaftaran acara ini sudah lewat.', icon: Ban },
  full: {
    title: 'Kuota pendaftaran penuh',
    body: 'Semua tempat sudah terisi. Simpan acaranya untuk memantau kabar dari penyelenggara.',
    icon: Users,
  },
};

function Unavailable({
  reason,
  eventPath,
  officialHref,
  studioHref,
}: {
  reason: RegistrationAvailability['reason'];
  eventPath: string;
  officialHref: string | null;
  studioHref: string | null;
}) {
  const copy = UNAVAILABLE[reason ?? 'form_closed'];
  const showOfficial = officialHref !== null && reason === 'form_closed';
  return (
    <div className="container-page flex flex-col items-center gap-4 py-20 text-center sm:py-28">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-pill bg-panel-nested">
        <copy.icon className="size-6 text-ink-muted" />
      </span>
      <h1 className="max-w-lg text-[clamp(24px,3.6vw,30px)] leading-tight [text-wrap:balance]">{copy.title}</h1>
      <p className="max-w-md text-ink-muted">{copy.body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {studioHref ? (
          <Link href={studioHref} className={buttonVariants()}>
            Buka penyusun formulir
          </Link>
        ) : (
          showOfficial && (
            // Lewat /daftar seperti tombol di halaman acara: klik tercatat (ADR-032), tujuan selalu tautan acara ini.
            <a href={officialHref} target="_blank" rel="noopener" className={buttonVariants()}>
              Buka formulir resmi <ArrowUpRight aria-hidden />
              <span className="sr-only">(tab baru)</span>
            </a>
          )
        )}
        <Link href={eventPath} className={buttonVariants({ variant: studioHref || showOfficial ? 'secondary' : 'primary' })}>
          Kembali ke acara
        </Link>
      </div>
    </div>
  );
}
