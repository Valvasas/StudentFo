import { FORM_TEMPLATES, type FormTemplate } from '@/lib/form-templates';
import { newFieldId, REGISTRATION_FORM_LIMITS, type RegistrationFormInput } from '@/lib/registration-form';
import type { EventType } from '@/types/domain';

/**
 * "Buat acara StudentFo" (ADR-093): aturan murni di balik form admin —
 * templat formulir awal dan syarat bayar — terpisah dari Server Action
 * supaya bisa diuji tanpa server.
 */

/** Templat bawaan per jenis kegiatan: lomba → tim, kegiatan belajar → seminar. */
export function defaultTemplateKey(eventType: EventType | null): FormTemplate['key'] {
  if (eventType === 'LOMBA') return 'lomba-tim';
  if (eventType === 'WORKSHOP' || eventType === 'KONFERENSI' || eventType === 'PELATIHAN') return 'seminar';
  return 'lomba-individu';
}

/** Kunci templat dari form; nilai asing = templat bawaan jenisnya (bukan galat). */
export function resolveTemplate(raw: string, eventType: EventType): FormTemplate {
  return (
    FORM_TEMPLATES.find((template) => template.key === raw) ??
    FORM_TEMPLATES.find((template) => template.key === defaultTemplateKey(eventType)) ??
    FORM_TEMPLATES[0]!
  );
}

export type InternalPayment =
  | { readonly ok: true; readonly feeAmount: number | null; readonly paymentInstructions: string | null }
  | { readonly ok: false };

/**
 * Lomba mandiri berbayar butuh nominal DAN cara bayar sejak awal: tanpa
 * keduanya pendaftar tidak tahu ke mana membayar, dan CHECK
 * `event_registration_forms` menolak biaya tanpa instruksi ≥ 10 karakter.
 * Gratis / belum tahu = formulir tanpa biaya.
 */
export function internalPayment(isFree: boolean | null, priceAmount: number | null, instructionsRaw: string): InternalPayment {
  if (isFree !== false) return { ok: true, feeAmount: null, paymentInstructions: null };
  const instructions = instructionsRaw.replace(/\r\n/g, '\n').trim();
  const fee = priceAmount !== null && Number.isInteger(priceAmount) ? priceAmount : priceAmount !== null ? Math.round(priceAmount) : null;
  if (
    fee === null ||
    fee < 1 ||
    fee > REGISTRATION_FORM_LIMITS.feeMax ||
    instructions.length < REGISTRATION_FORM_LIMITS.instructionsMin ||
    instructions.length > REGISTRATION_FORM_LIMITS.instructionsMax
  ) {
    return { ok: false };
  }
  return { ok: true, feeAmount: fee, paymentInstructions: instructions };
}

/**
 * Formulir awal acara StudentFo: kolom templat (id baru), TERTUTUP. Admin
 * memeriksa pertanyaannya dulu lalu membuka pendaftaran sendiri — formulir
 * yang belum dicek tidak boleh langsung menerima pendaftar.
 */
export function starterInternalForm(
  template: FormTemplate,
  payment: { readonly feeAmount: number | null; readonly paymentInstructions: string | null },
  random: () => number = Math.random,
): RegistrationFormInput {
  return {
    isOpen: false,
    intro: null,
    fields: template.fields.map((field) => ({ ...field, id: newFieldId(random) })),
    capacity: null,
    feeAmount: payment.feeAmount,
    paymentInstructions: payment.paymentInstructions,
  };
}
