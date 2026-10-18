import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarX2, Lock } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import {
  EventWorkspaceHeader,
  loadManagedEvent,
  NotManaging,
  workspaceBadges,
  workspacePath,
} from '@/components/organizer/event-workspace';
import { FormBuilder } from '@/components/organizer/form-builder';
import { RegistrationSaveBar } from '@/components/organizer/registration-save-bar';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { Badge } from '@/components/ui/badge';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatShortDateId } from '@/lib/deadline';
import { REGISTRATION_FORM_LIMITS, starterFields } from '@/lib/registration-form';
import type { RawSearchParams } from '@/lib/search-params';
import { saveRegistrationFormAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Formulir pendaftaran',
  robots: { index: false, follow: false },
};

const LIMITS = REGISTRATION_FORM_LIMITS;
const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Penyusun formulir pendaftaran internal satu acara (ADR-056). Satu `<form>`
 * berisi sakelar, pertanyaan (JSON dari `FormBuilder`), kuota, dan biaya —
 * disimpan sekaligus oleh `saveRegistrationFormAction`.
 */
export default async function RegistrationFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(workspacePath(id, 'formulir'));
  const context = await loadManagedEvent(user, id);
  if (!context) return <NotManaging />;
  const { event } = context;

  const [form, badges] = await Promise.all([(await getEventRepository()).getRegistrationForm(event.id), workspaceBadges(user, event.id)]);
  // Formulir baru mewarisi biaya yang sudah tertulis di halaman acara.
  const fee = form ? form.feeAmount : event.isFree === false ? event.priceAmount : null;
  const closed = registrationEventClosed(event);

  return (
    <div className="container-page flex flex-col gap-8 pb-0 pt-8">
      <EventWorkspaceHeader event={event} active="formulir" badges={badges} />

      <ActionFeedback params={query} className="max-w-2xl" />

      <form action={saveRegistrationFormAction} className="flex flex-col gap-6">
        <input type="hidden" name="eventId" value={event.id} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:grid-rows-[auto_auto_1fr]">
          <section aria-labelledby="status-pendaftaran" className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5 lg:col-start-2 lg:row-start-1">
            <h2 id="status-pendaftaran" className="sr-only">Status pendaftaran</h2>
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-focus">
              <span className="flex flex-col gap-1">
                <span className="font-semibold">Terima pendaftaran lewat StudentFo</span>
                <span className="text-sm text-ink-muted">
                  Saat aktif, tombol Daftar di halaman acara membuka formulir ini, bukan tautan luar.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="isOpen"
                defaultChecked={form?.isOpen ?? false}
                className="relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-pill bg-line-strong transition-colors duration-200 ease-snap before:absolute before:left-[3px] before:top-[3px] before:size-[22px] before:rounded-pill before:bg-canvas before:shadow-sm before:transition-transform before:duration-300 before:ease-[var(--easing-spring)] before:content-[''] checked:bg-brand checked:before:translate-x-5 focus-visible:outline-none"
              />
            </label>
            {closed && (
              <p className="flex items-start gap-2 rounded-card bg-caution-soft px-3 py-2.5 text-sm text-caution">
                <CalendarX2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                Tenggat acara sudah lewat — formulir tidak menerima pendaftar baru.
              </p>
            )}
            {form && (
              <div className="flex flex-col divide-y divide-line border-t border-line text-sm">
                <Link href={workspacePath(event.id, 'pendaftar')} className="group flex min-h-11 items-center justify-between gap-3 py-1">
                  <span className="text-ink-muted">
                    <strong className="font-semibold text-ink tabular-nums">{number(form.activeCount)}</strong> pendaftar aktif
                    {form.capacity !== null && <> dari kuota {number(form.capacity)}</>}
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    Lihat <ArrowRight aria-hidden className="size-4 transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
                  </span>
                </Link>
                {/* Tab baru: perubahan yang belum disimpan di sini tidak hilang. Pratinjau = versi tersimpan. */}
                <a href={`/events/${event.slug}/formulir`} target="_blank" rel="noopener" className="flex min-h-11 items-center justify-between gap-3 py-1 font-medium">
                  Pratinjau sebagai peserta
                  <ArrowUpRight aria-hidden className="size-4" />
                  <span className="sr-only">(tab baru)</span>
                </a>
              </div>
            )}
          </section>

          <section aria-labelledby="pertanyaan" className="flex min-w-0 flex-col gap-5 rounded-panel border border-line bg-panel p-4 sm:p-6 lg:col-start-1 lg:row-span-3 lg:row-start-1">
            <h2 id="pertanyaan" className="text-xl">Pertanyaan</h2>
            <Field id="intro" label="Pengantar untuk pendaftar (opsional)" hint="Tampil di atas formulir.">
              <TextArea
                id="intro"
                name="intro"
                rows={3}
                maxLength={LIMITS.introMax}
                defaultValue={form?.intro ?? ''}
                placeholder="Mis. satu orang mendaftar mewakili timnya."
              />
            </Field>
            <p className="flex items-center gap-3 rounded-card border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft">
              <Lock aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span>
                <strong className="font-semibold text-ink">Nama & email</strong> diambil otomatis dari akun peserta.
              </span>
            </p>
            <FormBuilder initialFields={form ? form.fields : starterFields()} />
          </section>

          <section aria-labelledby="kuota-biaya" className="flex flex-col gap-5 rounded-panel border border-line bg-panel p-5 lg:col-start-2 lg:row-start-2">
            <h2 id="kuota-biaya" className="text-lg">Kuota & biaya</h2>
            {/* Kuota 0 ditolak server, dan pengalihan galatnya membuang isian yang belum disimpan — pola menahannya di peramban. */}
            <Field id="capacity" label="Kuota peserta (opsional)" hint="Minimal 1. Kosongkan bila tanpa batas.">
              <TextInput
                id="capacity"
                name="capacity"
                inputMode="numeric"
                pattern="[0-9.\s]*[1-9][0-9.\s]*"
                maxLength={9}
                autoComplete="off"
                defaultValue={form?.capacity ? String(form.capacity) : ''}
                placeholder="Tanpa batas"
              />
            </Field>
            <Field id="feeAmount" label="Biaya pendaftaran (opsional)" hint="Kosongkan atau isi 0 untuk acara gratis.">
              <span className="relative block">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  Rp
                </span>
                <TextInput
                  id="feeAmount"
                  name="feeAmount"
                  inputMode="numeric"
                  pattern="[0-9.\s]*"
                  maxLength={13}
                  autoComplete="off"
                  defaultValue={fee ? number(fee) : ''}
                  placeholder="0"
                  aria-describedby="feeAmount-hint"
                  className="pl-10 tabular-nums"
                />
              </span>
            </Field>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="paymentInstructions" className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                Instruksi pembayaran
                <Badge variant="warning">Wajib bila berbayar</Badge>
              </label>
              <TextArea
                id="paymentInstructions"
                name="paymentInstructions"
                rows={4}
                maxLength={LIMITS.instructionsMax}
                defaultValue={form?.paymentInstructions ?? ''}
                placeholder="Mis. Transfer ke BCA 1234567890 a.n. Panitia. Tulis kode pendaftaran di berita transfer."
                aria-describedby="paymentInstructions-hint"
              />
              <p id="paymentInstructions-hint" className="text-[12.5px] leading-snug text-ink-muted">
                Rekening, e-wallet, atau QRIS tujuan. Hanya terlihat oleh pendaftar.
              </p>
            </div>
          </section>
        </div>

        <RegistrationSaveBar savedLabel={form ? `Disimpan ${formatShortDateId(form.updatedAt)}` : null} />
      </form>
    </div>
  );
}
