import { z } from 'zod';
import { daysUntil, jakartaDateKey } from '@/lib/deadline';
import { eligibilityReason } from '@/lib/eligibility';
import { formText, formTrimmed } from '@/lib/form-data';
import {
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  REGISTRATION_QUESTION_KINDS,
  REGISTRATION_REVIEW_MODES,
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_STATUSES,
  type EducationLevel,
  type EventSummary,
  type Registration,
  type RegistrationAnswer,
  type RegistrationForm,
  type RegistrationQuestion,
  type RegistrationSeats,
  type RegistrationStats,
  type RegistrationStatus,
} from '@/types/domain';

/**
 * Logika murni pendaftaran langsung (ADR-055), dipakai KEDUA repository —
 * pola yang sama dengan `listing.ts`. Kembaran SQL-nya ada di RPC migration
 * 20261006100001 (`submit_event_registration`, `promote_event_waitlist`,
 * `decide_event_registration`); batas & aturan di sini HARUS sama dengan
 * CHECK dan logika di sana, dan uji SQL `supabase/tests/94_registrations`
 * mengunci perilaku yang sama dari sisi database.
 */

export const REGISTRATION_LIMITS = {
  questionsMax: 6,
  labelMax: 160,
  optionsMax: 8,
  optionMax: 80,
  shortAnswerMax: 200,
  longAnswerMax: 1000,
  introMax: 400,
  confirmationMax: 600,
  capacityMax: 10_000,
  teamSizeMax: 10,
  institutionMax: 120,
  majorMax: 100,
  decisionNoteMax: 300,
  /** Pendaftaran baru per pengguna per jam — cukup untuk orang sungguhan, mahal untuk bot. */
  perHour: 10,
  /** Baris yang dimuat studio sekaligus. Acara kampus jarang melebihi ini; CSV memakai batas yang sama. */
  listMax: 2_000,
} as const;

/**
 * Formulir di domain kita yang meminta ini = alat phishing berlencana resmi.
 * Penyelenggara yang sungguh butuh NIK/rekening (beasiswa, honor) memakai
 * formulir resminya sendiri lewat tautan luar — di sana tanggung jawab data
 * ada pada mereka, bukan pada StudentFo (UU PDP: minimisasi data).
 */
const SENSITIVE_ASK =
  /(kata\s*sandi|password|\bpin\b|\botp\b|kode\s*(verifikasi|otp|keamanan)|\bcvv\b|nomor\s*kartu|kartu\s*kredit|rekening|\bno\.?\s*rek\b|\bnik\b|\bktp\b|kartu\s*keluarga|nomor\s*induk\s*kependudukan|nama\s*ibu\s*kandung)/i;

export function asksForSensitiveData(text: string): boolean {
  return SENSITIVE_ASK.test(text);
}

/* ------------------------------------------------------------------ */
/* Kode tiket                                                          */
/* ------------------------------------------------------------------ */

/** Tanpa 0/O, 1/I/L: kode dibacakan lewat telepon & diketik ulang di meja registrasi. */
export const TICKET_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TICKET_LENGTH = 8;

export function generateTicketCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < TICKET_LENGTH; index += 1) {
    code += TICKET_ALPHABET[Math.floor(random() * TICKET_ALPHABET.length) % TICKET_ALPHABET.length];
  }
  return code;
}

/** `ABCDEFGH` → `ABCD-EFGH`; kode tak dikenal dikembalikan apa adanya. */
export function formatTicketCode(code: string): string {
  return /^[A-Z0-9]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/* ------------------------------------------------------------------ */
/* Nomor WhatsApp                                                      */
/* ------------------------------------------------------------------ */

/**
 * `0812-3456-7890`, `62 812 3456 7890`, `+62 812…` → `+6281234567890`.
 * Hanya nomor Indonesia: penyelenggara menghubungi lewat WhatsApp, dan
 * nomor yang tidak bisa dihubungi lebih buruk daripada ditolak di depan.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  const national = digits.startsWith('62') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : null;
  if (!national || !/^8\d{8,12}$/.test(national)) return null;
  return `+62${national}`;
}

/** `+6281234567890` → `0812-3456-7890` untuk dibaca manusia. */
export function displayPhone(phone: string): string {
  const national = phone.startsWith('+62') ? `0${phone.slice(3)}` : phone;
  return national.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

/* ------------------------------------------------------------------ */
/* Gerbang, kursi, status                                              */
/* ------------------------------------------------------------------ */

export type GateReason = 'no_form' | 'not_open' | 'event_unavailable' | 'deadline_passed';
export type GateResult = { readonly ok: true } | { readonly ok: false; readonly reason: GateReason };

/** Formulir menerima pendaftar baru hanya bila OPEN, acaranya tayang, dan tenggat (hari WIB) belum lewat. */
export function registrationGate(
  form: Pick<RegistrationForm, 'status'> | null,
  event: Pick<EventSummary, 'status' | 'primaryDeadlineAt'>,
  now: Date = new Date(),
): GateResult {
  if (!form) return { ok: false, reason: 'no_form' };
  if (event.status !== 'APPROVED') return { ok: false, reason: 'event_unavailable' };
  if (form.status !== 'OPEN') return { ok: false, reason: 'not_open' };
  const left = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
  if (left !== null && left < 0) return { ok: false, reason: 'deadline_passed' };
  return { ok: true };
}

/** Status yang memegang kursi. Daftar tunggu & yang keluar tidak. */
export function holdsSeat(status: RegistrationStatus): boolean {
  return status === 'PENDING' || status === 'CONFIRMED';
}

export function isActiveRegistration(status: RegistrationStatus): boolean {
  return holdsSeat(status) || status === 'WAITLISTED';
}

export function remainingSeats(seats: RegistrationSeats): number | null {
  return seats.capacity === null ? null : Math.max(seats.capacity - seats.taken, 0);
}

/** Kursi tersedia → masuk sesuai mode; penuh → daftar tunggu bila diizinkan; selain itu `null` (kuota penuh). */
export function initialStatus(
  form: Pick<RegistrationForm, 'reviewMode' | 'waitlist'>,
  seats: RegistrationSeats,
): RegistrationStatus | null {
  const left = remainingSeats(seats);
  if (left === null || left > 0) return form.reviewMode === 'AUTO' ? 'CONFIRMED' : 'PENDING';
  return form.waitlist ? 'WAITLISTED' : null;
}

export function promotedStatus(form: Pick<RegistrationForm, 'reviewMode'>): RegistrationStatus {
  return form.reviewMode === 'AUTO' ? 'CONFIRMED' : 'PENDING';
}

type Queued = Pick<Registration, 'id' | 'status' | 'createdAt'>;

/** Urutan daftar tunggu: siapa duluan mendaftar, duluan naik (id sebagai pemecah seri, sama dengan SQL). */
export function waitlistOrder<T extends Queued>(registrations: readonly T[]): T[] {
  return registrations
    .filter((registration) => registration.status === 'WAITLISTED')
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

/**
 * Siapa yang naik dari daftar tunggu sekarang: sebanyak kursi kosong, FIFO.
 * Dipanggil setelah setiap kejadian yang bisa membebaskan kursi (batal,
 * ditolak, kuota ditambah). Tanpa batas kursi → seluruh antrean naik.
 */
export function planPromotions(form: Pick<RegistrationForm, 'capacity'>, registrations: readonly Queued[]): string[] {
  const queue = waitlistOrder(registrations);
  if (form.capacity === null) return queue.map((registration) => registration.id);
  const taken = registrations.filter((registration) => holdsSeat(registration.status)).length;
  return queue.slice(0, Math.max(form.capacity - taken, 0)).map((registration) => registration.id);
}

export function waitlistPositions(registrations: readonly Queued[]): Map<string, number> {
  return new Map(waitlistOrder(registrations).map((registration, index) => [registration.id, index + 1]));
}

export function canParticipantCancel(status: RegistrationStatus): boolean {
  return isActiveRegistration(status);
}

export const REGISTRATION_DECISIONS = ['CONFIRM', 'REJECT', 'REOPEN'] as const;
export type RegistrationDecision = (typeof REGISTRATION_DECISIONS)[number];

/**
 * Transisi sah oleh penyelenggara. `null` = tidak sah (ditolak dengan
 * `registration_invalid_transition`). Menaikkan orang dari daftar tunggu
 * secara manual tetap tunduk pada kuota — kalau tidak, kuota hanya hiasan.
 */
export function decideTransition(
  from: RegistrationStatus,
  decision: RegistrationDecision,
  form: Pick<RegistrationForm, 'reviewMode' | 'waitlist' | 'capacity'>,
  seats: RegistrationSeats,
): RegistrationStatus | null {
  const hasSeat = (remainingSeats(seats) ?? 1) > 0;
  switch (decision) {
    case 'CONFIRM':
      if (from === 'PENDING') return 'CONFIRMED';
      if (from === 'WAITLISTED' && hasSeat) return 'CONFIRMED';
      return null;
    case 'REJECT':
      return isActiveRegistration(from) ? 'REJECTED' : null;
    case 'REOPEN':
      if (from !== 'REJECTED') return null;
      if (hasSeat) return promotedStatus(form);
      return form.waitlist ? 'WAITLISTED' : null;
  }
}

/* ------------------------------------------------------------------ */
/* Skema formulir penyelenggara                                        */
/* ------------------------------------------------------------------ */

export const QUESTION_SLOTS = Array.from({ length: REGISTRATION_LIMITS.questionsMax }, (_, index) => `q${index + 1}`);

const optionalNote = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? null : value));

const questionSchema = z
  .object({
    id: z.string(),
    label: z
      .string()
      .trim()
      .min(3, 'Pertanyaan minimal 3 karakter.')
      .max(REGISTRATION_LIMITS.labelMax, `Pertanyaan maksimal ${REGISTRATION_LIMITS.labelMax} karakter.`)
      .refine((value) => !asksForSensitiveData(value), 'Formulir StudentFo tidak boleh meminta kata sandi, OTP, NIK/KTP, atau nomor rekening.'),
    kind: z.enum(REGISTRATION_QUESTION_KINDS),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(REGISTRATION_LIMITS.optionMax, `Pilihan maksimal ${REGISTRATION_LIMITS.optionMax} karakter.`)),
  })
  .superRefine((question, context) => {
    if (question.kind === 'CHOICE' && (question.options.length < 2 || question.options.length > REGISTRATION_LIMITS.optionsMax)) {
      context.addIssue({ code: 'custom', path: ['options'], message: `Pertanyaan pilihan butuh 2–${REGISTRATION_LIMITS.optionsMax} pilihan.` });
    }
    if (question.options.some((option) => asksForSensitiveData(option))) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'Pilihan tidak boleh meminta data sensitif.' });
    }
  })
  .transform((question): RegistrationQuestion => ({ ...question, options: question.kind === 'CHOICE' ? [...new Set(question.options)] : [] }));

export const registrationFormSchema = z
  .object({
    reviewMode: z.enum(REGISTRATION_REVIEW_MODES),
    capacity: z
      .number({ invalid_type_error: 'Kuota harus berupa angka.' })
      .int('Kuota harus bilangan bulat.')
      .min(1, 'Kuota minimal 1 kursi.')
      .max(REGISTRATION_LIMITS.capacityMax, `Kuota maksimal ${REGISTRATION_LIMITS.capacityMax.toLocaleString('id-ID')} kursi.`)
      .nullable(),
    waitlist: z.boolean(),
    teamSize: z
      .object({ min: z.number().int().min(1).max(REGISTRATION_LIMITS.teamSizeMax), max: z.number().int().min(1).max(REGISTRATION_LIMITS.teamSizeMax) })
      .refine((size) => size.min <= size.max, 'Ukuran tim minimal tidak boleh melebihi maksimal.')
      .nullable(),
    questions: z.array(questionSchema).max(REGISTRATION_LIMITS.questionsMax),
    intro: optionalNote(REGISTRATION_LIMITS.introMax, `Sapaan maksimal ${REGISTRATION_LIMITS.introMax} karakter.`),
    confirmationNote: optionalNote(REGISTRATION_LIMITS.confirmationMax, `Pesan tiket maksimal ${REGISTRATION_LIMITS.confirmationMax} karakter.`),
  })
  .refine((form) => !form.intro || !asksForSensitiveData(form.intro), { path: ['intro'], message: 'Sapaan tidak boleh meminta data sensitif.' })
  .refine((form) => !form.confirmationNote || !asksForSensitiveData(form.confirmationNote), {
    path: ['confirmationNote'],
    message: 'Pesan tiket tidak boleh meminta data sensitif.',
  });

export type RegistrationFormInput = z.infer<typeof registrationFormSchema>;

const numberOrNaN = (raw: string) => (raw === '' ? Number.NaN : Number(raw));

/**
 * FormData studio → input. Pertanyaan berupa slot tetap `q1`…`q6` (tanpa
 * JS: baris kosong diabaikan), jadi id pertanyaan stabil selama penyelenggara
 * menyunting di tempat — jawaban lama tetap tertaut ke slotnya.
 */
export function parseRegistrationForm(formData: FormData) {
  const questions = QUESTION_SLOTS.flatMap((id) => {
    const label = formTrimmed(formData, `${id}_label`);
    if (!label) return [];
    return [
      {
        id,
        label,
        kind: formTrimmed(formData, `${id}_kind`) || 'SHORT',
        required: formText(formData, `${id}_required`) === 'on',
        options: formText(formData, `${id}_options`)
          .split('\n')
          .map((option) => option.trim())
          .filter(Boolean),
      },
    ];
  });
  const capacityRaw = formTrimmed(formData, 'capacity');
  const teamMode = formTrimmed(formData, 'teamMode') === 'team';
  return registrationFormSchema.safeParse({
    reviewMode: formTrimmed(formData, 'reviewMode') || 'AUTO',
    capacity: capacityRaw === '' ? null : numberOrNaN(capacityRaw),
    waitlist: formText(formData, 'waitlist') === 'on',
    teamSize: teamMode ? { min: numberOrNaN(formTrimmed(formData, 'teamMin')), max: numberOrNaN(formTrimmed(formData, 'teamMax')) } : null,
    questions,
    intro: formText(formData, 'intro'),
    confirmationNote: formText(formData, 'confirmationNote'),
  });
}

/** Kunci kolom yang bermasalah (untuk `?fields=`), tanpa teks pesan di URL (ADR-019). */
export function issueFields(issues: readonly z.ZodIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.path.map(String).join('_') || 'form'))].slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Isian peserta                                                       */
/* ------------------------------------------------------------------ */

export interface RegistrationSubmission {
  readonly phone: string;
  readonly institution: string;
  readonly major: string | null;
  readonly educationLevel: EducationLevel;
  readonly answers: readonly RegistrationAnswer[];
  readonly teamId: string | null;
}

export type SubmissionParse =
  | { readonly success: true; readonly data: RegistrationSubmission }
  | { readonly success: false; readonly fields: readonly string[] };

function answerProblem(question: RegistrationQuestion, value: string): boolean {
  if (!value) return question.required;
  switch (question.kind) {
    case 'SHORT':
      return value.length > REGISTRATION_LIMITS.shortAnswerMax;
    case 'LONG':
      return value.length > REGISTRATION_LIMITS.longAnswerMax;
    case 'URL':
      return !/^https:\/\/[^\s]+$/i.test(value) || value.length > 500;
    case 'CHOICE':
      return !question.options.includes(value);
  }
}

/**
 * Isian peserta diperiksa terhadap formulir YANG SEDANG BERLAKU (bukan yang
 * dilihat peserta saat membuka halaman). Kesalahan dilaporkan sebagai daftar
 * kolom (`phone`, `q2`, `consent`) — teksnya dirakit di halaman.
 */
export function parseRegistrationSubmission(formData: FormData, form: Pick<RegistrationForm, 'questions' | 'teamSize'>): SubmissionParse {
  const fields: string[] = [];
  const phone = normalizePhone(formText(formData, 'phone'));
  if (!phone) fields.push('phone');
  const institution = formTrimmed(formData, 'institution').replace(/\s+/g, ' ');
  if (institution.length < 2 || institution.length > REGISTRATION_LIMITS.institutionMax) fields.push('institution');
  const majorRaw = formTrimmed(formData, 'major').replace(/\s+/g, ' ');
  if (majorRaw.length > REGISTRATION_LIMITS.majorMax) fields.push('major');
  const levelRaw = formTrimmed(formData, 'educationLevel');
  const level = (EDUCATION_LEVELS as readonly string[]).includes(levelRaw) ? (levelRaw as EducationLevel) : null;
  if (!level) fields.push('educationLevel');

  const answers: RegistrationAnswer[] = [];
  for (const question of form.questions) {
    const value = formTrimmed(formData, question.id);
    if (answerProblem(question, value)) fields.push(question.id);
    else if (value) answers.push({ questionId: question.id, label: question.label, value });
  }

  const teamId = formTrimmed(formData, 'teamId') || null;
  if (form.teamSize && !teamId) fields.push('teamId');
  if (formText(formData, 'consent') !== 'on') fields.push('consent');

  if (fields.length > 0 || !phone || !level) return { success: false, fields };
  return {
    success: true,
    data: { phone, institution, major: majorRaw || null, educationLevel: level, answers, teamId: form.teamSize ? teamId : null },
  };
}

/** Kelayakan jenjang sama persis dengan papan Beasiswa: `null` = boleh. */
export function registrationEligibility(event: Pick<EventSummary, 'educationLevels'>, level: EducationLevel): string | null {
  return eligibilityReason(event, level);
}

/* ------------------------------------------------------------------ */
/* Ekspor CSV                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sel CSV yang aman dibuka di Excel/Sheets: tanda kutip digandakan, dan sel
 * yang diawali `= + - @` (atau tab/CR) diberi awalan apostrof — kalau tidak,
 * jawaban peserta seperti `=HYPERLINK("http://jahat")` dieksekusi sebagai
 * rumus di komputer panitia (CSV/formula injection, OWASP).
 */
export function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function registrationsToCsv(form: Pick<RegistrationForm, 'questions' | 'teamSize'>, registrations: readonly Registration[]): string {
  const header = [
    'Kode',
    'Status',
    'Nama',
    'Email',
    'WhatsApp',
    'Institusi',
    'Jurusan',
    'Jenjang',
    ...(form.teamSize ? ['Tim', 'Anggota tim'] : []),
    ...form.questions.map((question) => question.label),
    'Waktu daftar (WIB)',
  ];
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
  const rows = registrations.map((registration) => [
    formatTicketCode(registration.code),
    REGISTRATION_STATUS_LABEL[registration.status],
    registration.fullName,
    registration.email,
    displayPhone(registration.phone),
    registration.institution,
    registration.major,
    EDUCATION_LEVEL_LABEL[registration.educationLevel],
    ...(form.teamSize ? [registration.team?.title ?? null, registration.team?.members.join(', ') ?? null] : []),
    ...form.questions.map((question) => registration.answers.find((answer) => answer.questionId === question.id)?.value ?? null),
    time.format(new Date(registration.createdAt)),
  ]);
  // BOM: Excel Windows membaca CSV tanpa BOM sebagai ANSI dan merusak nama beraksen.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ */
/* Statistik (mode seed; kembaran SQL: registration_stats)             */
/* ------------------------------------------------------------------ */

export const REGISTRATION_RANGES = [14, 30, 90] as const;

export function emptyStatusCounts(): Record<RegistrationStatus, number> {
  return Object.fromEntries(REGISTRATION_STATUSES.map((status) => [status, 0])) as Record<RegistrationStatus, number>;
}

export function summarizeRegistrations(input: {
  registrations: readonly (Registration & { readonly cancelledAt?: string | null })[];
  capacity: number | null;
  visitors: number;
  days: number;
  now?: Date;
}): RegistrationStats {
  const now = input.now ?? new Date();
  const span = Math.min(Math.max(input.days, 7), 90);
  const keys = Array.from({ length: span }, (_, index) => jakartaDateKey(new Date(now.getTime() - (span - 1 - index) * 86_400_000)));
  const submitted = new Map<string, number>();
  const cancelled = new Map<string, number>();
  const byStatus = emptyStatusCounts();
  const levels = new Map<string, number>();
  const institutions = new Map<string, number>();
  const decisionHours: number[] = [];

  for (const registration of input.registrations) {
    byStatus[registration.status] += 1;
    const day = jakartaDateKey(new Date(registration.createdAt));
    submitted.set(day, (submitted.get(day) ?? 0) + 1);
    if (registration.status === 'CANCELLED') {
      const at = jakartaDateKey(new Date(registration.cancelledAt ?? registration.decidedAt ?? registration.createdAt));
      cancelled.set(at, (cancelled.get(at) ?? 0) + 1);
    }
    if (isActiveRegistration(registration.status)) {
      const level = EDUCATION_LEVEL_LABEL[registration.educationLevel];
      levels.set(level, (levels.get(level) ?? 0) + 1);
      institutions.set(registration.institution, (institutions.get(registration.institution) ?? 0) + 1);
    }
    if (registration.decidedAt && (registration.status === 'CONFIRMED' || registration.status === 'REJECTED')) {
      decisionHours.push((new Date(registration.decidedAt).getTime() - new Date(registration.createdAt).getTime()) / 3_600_000);
    }
  }

  const ranked = (counts: Map<string, number>, limit: number) =>
    [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, limit);
  decisionHours.sort((left, right) => left - right);
  const middle = decisionHours.length / 2;
  const median =
    decisionHours.length === 0
      ? null
      : decisionHours.length % 2
        ? decisionHours[Math.floor(middle)]!
        : (decisionHours[middle - 1]! + decisionHours[middle]!) / 2;

  return {
    days: span,
    series: keys.map((day) => ({ day, submitted: submitted.get(day) ?? 0, cancelled: cancelled.get(day) ?? 0 })),
    byStatus,
    capacity: input.capacity,
    visitors: input.visitors,
    levels: ranked(levels, 6),
    institutions: ranked(institutions, 6),
    medianDecisionHours: median === null ? null : Math.round(median * 10) / 10,
  };
}

/* ------------------------------------------------------------------ */
/* Saran untuk dasbor                                                  */
/* ------------------------------------------------------------------ */

export interface RegistrationInsight {
  readonly tone: 'good' | 'warn' | 'info';
  readonly text: string;
}

export function submittedInRange(stats: Pick<RegistrationStats, 'series'>): number {
  return stats.series.reduce((sum, day) => sum + day.submitted, 0);
}

/** Kalimat yang bisa ditindaklanjuti, diturunkan dari angka yang sama dengan grafiknya. Diam bila datanya terlalu sedikit. */
export function registrationInsights(stats: RegistrationStats, form: Pick<RegistrationForm, 'reviewMode' | 'waitlist' | 'status'>): RegistrationInsight[] {
  const insights: RegistrationInsight[] = [];
  const taken = stats.byStatus.PENDING + stats.byStatus.CONFIRMED;
  const total = REGISTRATION_STATUSES.reduce((sum, status) => sum + stats.byStatus[status], 0);

  if (stats.capacity !== null && taken / stats.capacity >= 0.85 && form.status === 'OPEN') {
    insights.push({
      tone: 'warn',
      text: form.waitlist
        ? `Kursi terisi ${Math.round((taken / stats.capacity) * 100)}%. Pendaftar berikutnya masuk daftar tunggu dan naik otomatis bila ada yang batal.`
        : `Kursi terisi ${Math.round((taken / stats.capacity) * 100)}%. Aktifkan daftar tunggu supaya peminat tidak hilang saat kuota penuh.`,
    });
  }
  if (form.reviewMode === 'MANUAL' && stats.byStatus.PENDING >= 5) {
    insights.push({ tone: 'warn', text: `${stats.byStatus.PENDING} pendaftar menunggu keputusanmu. Keputusan yang cepat membuat peserta tetap yakin untuk hadir.` });
  }
  // Penyebutnya pengunjung di rentang yang sama — total sepanjang masa dibagi pengunjung 30 hari akan melebih-lebihkan.
  const submitted = submittedInRange(stats);
  if (stats.visitors >= 30 && submitted > 0) {
    const rate = (submitted / stats.visitors) * 100;
    const shown = rate.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    insights.push(
      rate >= 5
        ? { tone: 'good', text: `${shown}% pengunjung halaman dalam ${stats.days} hari terakhir akhirnya mendaftar.` }
        : { tone: 'info', text: `${shown}% pengunjung mendaftar. Coba kurangi pertanyaan wajib — formulir yang pendek lebih sering diselesaikan.` },
    );
  }
  if (total >= 10 && stats.byStatus.CANCELLED / total >= 0.2) {
    insights.push({ tone: 'info', text: 'Satu dari lima pendaftar membatalkan. Pesan tiket yang jelas (jadwal, grup koordinasi) membantu menahan mereka.' });
  }
  return insights.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* JSON dari RPC registration_stats (mode Supabase)                    */
/* ------------------------------------------------------------------ */

const statCount = z.number().int().nonnegative().catch(0);
const statBucket = z.object({ label: z.string().max(160), count: statCount });

const registrationStatsSchema = z.object({
  days: z.number().int().positive(),
  series: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), submitted: statCount, cancelled: statCount })),
  byStatus: z.object(Object.fromEntries(REGISTRATION_STATUSES.map((status) => [status, statCount])) as Record<RegistrationStatus, typeof statCount>),
  capacity: z.number().int().positive().nullable(),
  visitors: statCount,
  levels: z.array(statBucket),
  institutions: z.array(statBucket),
  medianDecisionHours: z.number().nonnegative().nullable().catch(null),
});

/**
 * JSON dari RPC = batas kepercayaan; bentuk yang salah jadi `null`, bukan
 * grafik rusak. Jenjang dikirim SQL sebagai kode enum → label tampilan di
 * sini, supaya kedua repository menghasilkan teks yang sama.
 */
export function parseRegistrationStats(raw: unknown): RegistrationStats | null {
  const parsed = registrationStatsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const levelLabel = (code: string) => (code in EDUCATION_LEVEL_LABEL ? EDUCATION_LEVEL_LABEL[code as EducationLevel] : code);
  return { ...parsed.data, levels: parsed.data.levels.map((bucket) => ({ ...bucket, label: levelLabel(bucket.label) })) };
}
