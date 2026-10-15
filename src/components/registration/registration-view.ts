import { isActiveRegistration, registrationAvailability } from '@/lib/registration-form';
import type { EventDetail, EventRegistration, FormField, RegistrationForm, RegistrationStatus } from '@/types/domain';

/**
 * Tenggat lewat = per DETIK, bukan per hari kalender seperti label "H-n":
 * `register_for_event()` menolak begitu `primary_deadline_at` lewat, jadi
 * formulir yang masih tampil terbuka di sore hari tenggat berakhir dengan
 * `registration_closed` setelah orang mengisi semuanya.
 */
export function registrationEventClosed(
  event: Pick<EventDetail, 'status' | 'primaryDeadlineAt'>,
  now: Date = new Date(),
): boolean {
  if (event.status === 'EXPIRED') return true;
  return event.primaryDeadlineAt !== null && Date.parse(event.primaryDeadlineAt) <= now.getTime();
}

export type RegistrationCta =
  | { readonly kind: 'mine'; readonly registrationId: string; readonly status: RegistrationStatus }
  | { readonly kind: 'open'; readonly remaining: number | null }
  | { readonly kind: 'full' }
  | { readonly kind: 'closed' };

/**
 * Ajakan daftar di halaman acara. `null` = acara tanpa formulir internal
 * yang aktif → tetap tautan resmi penyelenggara. Formulir yang dinonaktifkan
 * panitia juga `null`: studio menjanjikan "saat aktif, tombol Daftar membuka
 * formulir ini" — selama nonaktif tautan luar tetap berlaku.
 */
export function registrationCta(
  form: Pick<RegistrationForm, 'isOpen' | 'capacity' | 'activeCount'> | null,
  mine: Pick<EventRegistration, 'id' | 'status'> | null,
  eventClosed: boolean,
): RegistrationCta | null {
  if (mine) return { kind: 'mine', registrationId: mine.id, status: mine.status };
  if (!form?.isOpen) return null;
  const availability = registrationAvailability(form, eventClosed);
  if (availability.open) return { kind: 'open', remaining: availability.remaining };
  return availability.reason === 'full' ? { kind: 'full' } : { kind: 'closed' };
}

export type StepState = 'done' | 'current' | 'todo';
export interface RegistrationStep {
  readonly label: string;
  readonly state: StepState;
}

/**
 * Langkah di halaman pendaftaran. Ditolak/dibatalkan tidak punya langkah
 * (`null`) — halaman menampilkan keadaannya sendiri, bukan rangkaian yang
 * berhenti di tengah. Panitia bisa menandai lunas langsung dari "Menunggu
 * pembayaran" (bayar tunai), jadi Terkonfirmasi selalu = semua selesai.
 */
export function registrationSteps(status: RegistrationStatus, paid: boolean): readonly RegistrationStep[] | null {
  if (!isActiveRegistration(status)) return null;
  if (!paid) {
    return [
      { label: 'Daftar', state: 'done' },
      { label: 'Terkonfirmasi', state: status === 'CONFIRMED' ? 'done' : 'current' },
    ];
  }
  const position = status === 'AWAITING_PAYMENT' ? 1 : status === 'PAYMENT_REVIEW' ? 2 : 4;
  return ['Daftar', 'Bayar', 'Diperiksa', 'Terkonfirmasi'].map((label, index) => ({
    label,
    state: index < position ? 'done' : index === position ? 'current' : 'todo',
  }));
}

export interface RegistrationGroups {
  readonly awaitingPayment: readonly EventRegistration[];
  readonly inReview: readonly EventRegistration[];
  readonly confirmed: readonly EventRegistration[];
  readonly history: readonly EventRegistration[];
  /** Jumlah yang masih harus ditransfer (Menunggu pembayaran). */
  readonly amountDue: number;
}

export function groupRegistrations(registrations: readonly EventRegistration[]): RegistrationGroups {
  const of = (...statuses: RegistrationStatus[]) => registrations.filter((entry) => statuses.includes(entry.status));
  const awaitingPayment = of('AWAITING_PAYMENT');
  return {
    awaitingPayment,
    inReview: of('PAYMENT_REVIEW'),
    confirmed: of('CONFIRMED'),
    history: of('CANCELLED', 'REJECTED'),
    amountDue: awaitingPayment.reduce((sum, entry) => sum + (entry.feeAmount ?? 0), 0),
  };
}

/** Pengenal persetujuan berbagi data — bukan kolom penyelenggara, tapi bisa ditandai salah dengan cara yang sama. */
export const CONSENT_FIELD = 'consent';

/**
 * `?kolom=` dari URL hanya dipercaya bila menunjuk kolom formulir ini (atau
 * persetujuan): nilainya dipakai sebagai id elemen & untuk autofocus.
 */
export function invalidFieldFrom(raw: string | undefined, fields: readonly Pick<FormField, 'id'>[]): string | null {
  if (!raw) return null;
  if (raw === CONSENT_FIELD) return raw;
  return fields.some((field) => field.id === raw) ? raw : null;
}
