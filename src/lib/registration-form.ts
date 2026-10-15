import { z } from 'zod';
import { formList, formText, formTrimmed } from '@/lib/form-data';
import { stripMarkup } from '@/lib/submission-schema';
import {
  FORM_FIELD_TYPES,
  REGISTRATION_STATUS_LABEL,
  type AnswerValue,
  type EventRegistration,
  type FormField,
  type FormFieldType,
  type RegistrationStatus,
} from '@/types/domain';

/**
 * Formulir pendaftaran internal (ADR-056): skema yang disusun penyelenggara,
 * validasi jawaban peserta, mesin status pembayaran, dan ekspor CSV.
 *
 * Semua batas di sini dicerminkan CHECK di migration 20261014100001 (ukuran
 * JSONB, panjang teks). Validasi dobel itu disengaja: aplikasi memberi pesan
 * yang bisa diperbaiki, database menjaga dari klien yang tidak kita tulis.
 */

export const REGISTRATION_FORM_LIMITS = {
  maxFields: 25,
  labelMax: 120,
  helpMax: 240,
  optionsMin: 2,
  optionsMax: 20,
  optionMax: 80,
  shortTextMax: 200,
  longTextMax: 2000,
  urlMax: 500,
  introMax: 1000,
  instructionsMin: 10,
  instructionsMax: 1000,
  capacityMax: 100_000,
  feeMax: 100_000_000,
  noteMax: 500,
} as const;

/** Pendaftaran per pengguna per jam — cermin `consume_rate_limit` di `register_for_event()`. */
export const REGISTRATION_RATE_LIMIT = { perHour: 10 } as const;

const FIELD_ID = /^f_[a-z0-9]{4,16}$/;

/** Karakter kendali & tak terlihat dibuang, markup dilucuti — jawaban juga mengalir ke CSV & email panitia. */
function cleanText(value: string): string {
  return stripMarkup(value).trim();
}

const fieldSchema = z
  .object({
    id: z.string().regex(FIELD_ID),
    type: z.enum(FORM_FIELD_TYPES),
    label: z.string().transform(cleanText).pipe(z.string().min(1).max(REGISTRATION_FORM_LIMITS.labelMax)),
    help: z
      .string()
      .nullish()
      .transform((value) => (value ? cleanText(value) : ''))
      .pipe(z.string().max(REGISTRATION_FORM_LIMITS.helpMax))
      .transform((value) => value || null),
    required: z.boolean(),
    options: z
      .array(z.string().transform(cleanText).pipe(z.string().min(1).max(REGISTRATION_FORM_LIMITS.optionMax)))
      .max(REGISTRATION_FORM_LIMITS.optionsMax)
      .default([]),
  })
  .transform((field): FormField => ({
    ...field,
    // Pilihan hanya bermakna untuk dua jenis; jenis lain tidak membawa sisa pilihan dari jenis sebelumnya.
    options: hasOptions(field.type) ? [...new Set(field.options)] : [],
  }))
  .refine((field) => !hasOptions(field.type) || field.options.length >= REGISTRATION_FORM_LIMITS.optionsMin, {
    message: 'options',
  });

export function hasOptions(type: FormFieldType): boolean {
  return type === 'select' || type === 'multi_select';
}

export const formFieldsSchema = z
  .array(fieldSchema)
  .max(REGISTRATION_FORM_LIMITS.maxFields)
  .refine((fields) => new Set(fields.map((field) => field.id)).size === fields.length, { message: 'duplicate_id' });

/** Bentuk tersimpan → kolom; baris rusak dibuang alih-alih menjatuhkan halaman (data JSONB tanpa skema DB). */
export function parseStoredFields(value: unknown): FormField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = fieldSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export interface RegistrationFormInput {
  readonly isOpen: boolean;
  readonly intro: string | null;
  readonly fields: readonly FormField[];
  readonly capacity: number | null;
  readonly feeAmount: number | null;
  readonly paymentInstructions: string | null;
}

export type RegistrationFormError =
  | 'invalid_registration_form'
  | 'registration_form_fields'
  | 'registration_form_payment';

function parseWholeNumber(raw: string, max: number): number | null | 'invalid' {
  const digits = raw.replace(/[.\s]/g, '');
  if (digits === '') return null;
  if (!/^\d{1,9}$/.test(digits)) return 'invalid';
  const value = Number(digits);
  return value <= max ? value : 'invalid';
}

/**
 * Isian halaman "Formulir" di studio. Kolom-kolom datang sebagai satu JSON
 * dari penyusun (komponen klien); sisanya isian biasa. Biaya 0 = gratis.
 */
export function parseRegistrationFormInput(
  formData: FormData,
): { ok: true; value: RegistrationFormInput } | { ok: false; error: RegistrationFormError } {
  let rawFields: unknown;
  try {
    rawFields = JSON.parse(formText(formData, 'fields') || '[]');
  } catch {
    return { ok: false, error: 'registration_form_fields' };
  }
  const fields = formFieldsSchema.safeParse(rawFields);
  if (!fields.success) return { ok: false, error: 'registration_form_fields' };

  const capacity = parseWholeNumber(formTrimmed(formData, 'capacity'), REGISTRATION_FORM_LIMITS.capacityMax);
  const fee = parseWholeNumber(formTrimmed(formData, 'feeAmount'), REGISTRATION_FORM_LIMITS.feeMax);
  if (capacity === 'invalid' || fee === 'invalid' || capacity === 0) return { ok: false, error: 'invalid_registration_form' };

  const intro = cleanText(formText(formData, 'intro'));
  const instructions = cleanText(formText(formData, 'paymentInstructions'));
  if (intro.length > REGISTRATION_FORM_LIMITS.introMax || instructions.length > REGISTRATION_FORM_LIMITS.instructionsMax) {
    return { ok: false, error: 'invalid_registration_form' };
  }

  const feeAmount = fee && fee > 0 ? fee : null;
  // Acara berbayar tanpa tujuan transfer = peserta terjebak di "Menunggu pembayaran".
  if (feeAmount !== null && instructions.length < REGISTRATION_FORM_LIMITS.instructionsMin) {
    return { ok: false, error: 'registration_form_payment' };
  }

  return {
    ok: true,
    value: {
      isOpen: formText(formData, 'isOpen') === 'on',
      intro: intro || null,
      fields: fields.data,
      capacity,
      feeAmount,
      paymentInstructions: feeAmount !== null ? instructions : instructions || null,
    },
  };
}

/** Nama input jawaban — awalan tetap supaya kolom penyelenggara tidak bisa menimpa `eventId`/`returnTo`. */
export function answerInputName(field: Pick<FormField, 'id'>): string {
  return `q_${field.id}`;
}

const emailAnswer = z.string().email().max(254);
const PHONE = /^\+?[0-9][0-9\s-]{6,18}[0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export type AnswerResult =
  | { ok: true; answers: Record<string, AnswerValue> }
  | { ok: false; fieldId: string };

/**
 * Baca & validasi jawaban. Kolom opsional yang kosong tidak disimpan sama
 * sekali (bukan string kosong), jadi CSV dan tampilan bisa membedakan
 * "tidak diisi" dari jawaban.
 */
export function readAnswers(fields: readonly FormField[], formData: FormData): AnswerResult {
  const answers: Record<string, AnswerValue> = {};

  for (const field of fields) {
    const name = answerInputName(field);
    const fail = { ok: false as const, fieldId: field.id };

    if (field.type === 'multi_select') {
      const chosen = [...new Set(formList(formData, name))];
      if (chosen.some((value) => !field.options.includes(value))) return fail;
      if (chosen.length === 0) {
        if (field.required) return fail;
        continue;
      }
      answers[field.id] = chosen;
      continue;
    }

    if (field.type === 'checkbox') {
      const checked = formText(formData, name) === 'on';
      if (field.required && !checked) return fail;
      answers[field.id] = checked;
      continue;
    }

    const raw = cleanText(formText(formData, name));
    if (raw === '') {
      if (field.required) return fail;
      continue;
    }

    switch (field.type) {
      case 'short_text':
        if (raw.length > REGISTRATION_FORM_LIMITS.shortTextMax) return fail;
        answers[field.id] = raw.replace(/\s+/g, ' ');
        break;
      case 'long_text':
        if (raw.length > REGISTRATION_FORM_LIMITS.longTextMax) return fail;
        answers[field.id] = raw;
        break;
      case 'email':
        if (!emailAnswer.safeParse(raw).success) return fail;
        answers[field.id] = raw.toLowerCase();
        break;
      case 'phone':
        if (!PHONE.test(raw)) return fail;
        answers[field.id] = raw.replace(/[\s-]/g, '');
        break;
      case 'number': {
        const value = Number(raw.replace(',', '.'));
        if (!Number.isFinite(value) || Math.abs(value) > 1e12) return fail;
        answers[field.id] = value;
        break;
      }
      case 'date':
        if (!isValidDate(raw)) return fail;
        answers[field.id] = raw;
        break;
      case 'url':
        if (raw.length > REGISTRATION_FORM_LIMITS.urlMax || !isHttpUrl(raw)) return fail;
        answers[field.id] = raw;
        break;
      case 'select':
        if (!field.options.includes(raw)) return fail;
        answers[field.id] = raw;
        break;
    }
  }

  return { ok: true, answers };
}

/** Jawaban → teks untuk tampilan & CSV. */
export function formatAnswer(value: AnswerValue | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'number') return value.toLocaleString('id-ID');
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// ------------------------------------------------------------------
// Mesin status pendaftaran & pembayaran
// ------------------------------------------------------------------

export type ReviewDecision = 'confirm' | 'reject_payment' | 'reject';
export type RegistrationAction = ReviewDecision | 'submit_proof' | 'cancel';

/**
 * Satu-satunya definisi transisi. Kembaran SQL ada di fungsi
 * `review_event_registration`/`submit_payment_proof`/`cancel_event_registration`
 * — ubah keduanya bersamaan (diuji di `registration-form.test.ts` dan
 * `supabase/tests/94_registrations.test.sql`).
 *
 * - `confirm` juga dari AWAITING_PAYMENT: peserta membayar tunai/di luar
 *   aplikasi dan panitia menandainya lunas tanpa bukti unggahan.
 * - Bukti boleh diganti selama masih diperiksa (salah unggah berkas).
 * - REJECTED final: peserta tidak bisa mendaftar ulang ke acara itu.
 */
export function registrationTransition(from: RegistrationStatus, action: RegistrationAction): RegistrationStatus | null {
  switch (action) {
    case 'submit_proof':
      return from === 'AWAITING_PAYMENT' || from === 'PAYMENT_REVIEW' ? 'PAYMENT_REVIEW' : null;
    case 'confirm':
      return from === 'AWAITING_PAYMENT' || from === 'PAYMENT_REVIEW' ? 'CONFIRMED' : null;
    case 'reject_payment':
      return from === 'PAYMENT_REVIEW' ? 'AWAITING_PAYMENT' : null;
    case 'reject':
    case 'cancel':
      return from === 'AWAITING_PAYMENT' || from === 'PAYMENT_REVIEW' || from === 'CONFIRMED'
        ? action === 'reject'
          ? 'REJECTED'
          : 'CANCELLED'
        : null;
  }
}

/** Status awal: gratis langsung terkonfirmasi, berbayar menunggu pembayaran. */
export function initialRegistrationStatus(feeAmount: number | null): RegistrationStatus {
  return feeAmount && feeAmount > 0 ? 'AWAITING_PAYMENT' : 'CONFIRMED';
}

/** Pendaftaran yang memakan kuota & menghalangi pendaftaran kedua. */
export function isActiveRegistration(status: RegistrationStatus): boolean {
  return status !== 'CANCELLED' && status !== 'REJECTED';
}

export function reviewDecisionOf(value: string): ReviewDecision | null {
  return value === 'confirm' || value === 'reject_payment' || value === 'reject' ? value : null;
}

/** Catatan wajib saat menolak — peserta harus tahu apa yang diperbaiki. */
export function reviewNoteRequired(decision: ReviewDecision): boolean {
  return decision !== 'confirm';
}

export function parseReviewNote(value: string): string | null {
  const note = cleanText(value);
  return note.length > 0 && note.length <= REGISTRATION_FORM_LIMITS.noteMax ? note : null;
}

const CODE_ALPHABET = '0123456789ABCDEF';

/** `SF-` + 8 heksadesimal — sama dengan `register_for_event()` di SQL. */
export function newRegistrationCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[Math.floor(random() * 16)] ?? '0';
  return `SF-${code}`;
}

export interface RegistrationAvailability {
  readonly open: boolean;
  readonly reason: 'form_closed' | 'event_closed' | 'full' | null;
  readonly remaining: number | null;
}

export function registrationAvailability(
  form: { isOpen: boolean; capacity: number | null; activeCount: number } | null,
  eventClosed: boolean,
): RegistrationAvailability {
  if (!form || !form.isOpen) return { open: false, reason: 'form_closed', remaining: null };
  if (eventClosed) return { open: false, reason: 'event_closed', remaining: null };
  const remaining = form.capacity === null ? null : Math.max(form.capacity - form.activeCount, 0);
  if (remaining === 0) return { open: false, reason: 'full', remaining: 0 };
  return { open: true, reason: null, remaining };
}

// ------------------------------------------------------------------
// Ekspor CSV
// ------------------------------------------------------------------

/**
 * Sel CSV aman untuk spreadsheet. Jawaban yang diawali `=`, `+`, `-`, `@`,
 * tab, atau CR dieksekusi Excel/Sheets sebagai rumus (CSV injection,
 * OWASP) — `=HYPERLINK("http://jahat",…)` di kolom "Nama" cukup untuk
 * memancing panitia. Diberi awalan `'` supaya tampil sebagai teks.
 */
export function csvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

const csvDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function registrationsToCsv(fields: readonly FormField[], registrations: readonly EventRegistration[]): string {
  const header = ['Kode', 'Nama', 'Email akun', 'Status', 'Biaya', 'Waktu daftar (WIB)', ...fields.map((field) => field.label)];
  const rows = registrations.map((registration) => [
    registration.code,
    registration.fullName,
    registration.email,
    REGISTRATION_STATUS_LABEL[registration.status],
    registration.feeAmount ? String(registration.feeAmount) : 'Gratis',
    csvDate.format(new Date(registration.createdAt)),
    ...fields.map((field) => formatAnswer(registration.answers[field.id])),
  ]);
  // BOM: tanpa ini Excel membuka UTF-8 sebagai Windows-1252 dan nama ber-aksen rusak.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Id kolom baru untuk penyusun (klien) — acak, bukan dari label, supaya mengganti label tidak memutus jawaban lama. */
export function newFieldId(random: () => number = Math.random): string {
  let id = 'f_';
  for (let index = 0; index < 8; index += 1) id += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)] ?? 'a';
  return id;
}

/** Kolom awal formulir baru — yang hampir selalu diminta panitia, bisa dihapus. */
export function starterFields(random: () => number = Math.random): FormField[] {
  return [
    { id: newFieldId(random), type: 'phone', label: 'Nomor WhatsApp', help: 'Untuk info teknis acara dari panitia.', required: true, options: [] },
    { id: newFieldId(random), type: 'short_text', label: 'Asal sekolah / kampus', help: null, required: true, options: [] },
  ];
}
