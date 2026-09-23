import { z } from 'zod';
import { emailSchema } from '@/lib/auth-schema';
import { formList as list, formText as text } from '@/lib/form-data';
import { daysUntil } from '@/lib/deadline';
import {
  EDUCATION_LEVELS,
  EVENT_TYPES,
  type Submission,
  type SubmissionPayload,
} from '@/types/domain';

/**
 * Validasi kiriman kegiatan dari komunitas (`/submit`, Phase 3).
 *
 * Batas panjang di sini MENCERMINKAN kolom `events` di migration 0001,
 * karena payload yang disetujui disalin apa adanya ke tabel itu. Validasi
 * yang lebih longgar dari kolomnya baru gagal saat admin menekan "Setujui" —
 * jauh dari orang yang bisa memperbaiki isinya.
 *
 * Aturan tanggal sengaja SAMA dengan gerbang pipeline
 * (`pipeline/studentfo_pipeline/models.py`): tenggat tidak boleh sudah lewat
 * dan tidak boleh lebih dari 3 tahun ke depan (indikasi salah ketik tahun).
 */

const MAX_DEADLINE_DAYS = 3 * 366;

const httpUrlSchema = z
  .string()
  .trim()
  .max(2000, 'Tautan terlalu panjang.')
  .url('Tautan harus berupa alamat web lengkap, diawali https://')
  .refine((value) => /^https?:\/\//i.test(value), 'Tautan harus diawali http:// atau https://');

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length === 0 ? null : value));

/** `YYYY-MM-DD` dari `<input type="date">` → 23:59 WIB pada hari itu, sebagai ISO UTC. */
export function dateInputToDeadlineIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), 16, 59, 0);
  const date = new Date(utc);
  // Tolak tanggal yang "digulung" Date (mis. 2026-02-31 → 3 Maret).
  if (date.getUTCDate() !== Number(day)) return null;
  return date.toISOString();
}

export function createSubmissionSchema(now: Date = new Date()) {
  return z.object({
    submittedByEmail: emailSchema,
    title: z
      .string()
      .trim()
      .min(6, 'Judul kegiatan minimal 6 karakter.')
      .max(255, 'Judul kegiatan maksimal 255 karakter.')
      .transform((value) => value.replace(/\s+/g, ' ')),
    organizer: z
      .string()
      .trim()
      .min(2, 'Nama penyelenggara minimal 2 karakter.')
      .max(255, 'Nama penyelenggara maksimal 255 karakter.'),
    description: optionalText(5000, 'Deskripsi maksimal 5000 karakter.'),
    eventType: z.enum(EVENT_TYPES, { message: 'Pilih jenis kegiatan.' }),
    registrationLink: httpUrlSchema,
    sourceUrl: z.union([httpUrlSchema, z.literal('').transform(() => null)]),
    educationLevels: z
      .array(z.enum(EDUCATION_LEVELS))
      .min(1, 'Pilih minimal satu jenjang peserta.')
      .max(EDUCATION_LEVELS.length),
    categorySlugs: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(12),
    location: optionalText(120, 'Lokasi maksimal 120 karakter.'),
    isOnline: z.boolean(),
    deadlineAt: z
      .string({ message: 'Tanggal tenggat belum diisi.' })
      .refine((value) => {
        const days = daysUntil(value, now);
        return days !== null && days >= 0;
      }, 'Tenggat pendaftaran tidak boleh sudah lewat.')
      .refine((value) => {
        const days = daysUntil(value, now);
        return days !== null && days <= MAX_DEADLINE_DAYS;
      }, 'Tenggat lebih dari 3 tahun ke depan — periksa lagi tahunnya.'),
  });
}

export type ParsedSubmission = SubmissionPayload & { readonly submittedByEmail: string };

/**
 * Honeypot: kolom tersembunyi yang tidak pernah diisi manusia. Bot pengisi
 * form mengisi semua input yang ia temukan. Ini bukan pengganti pembatasan
 * laju, tapi menyaring spam paling murah tanpa CAPTCHA (yang butuh JS dan
 * pihak ketiga — dua hal yang produk ini hindari).
 */
export const HONEYPOT_FIELD = 'website';

export function isLikelyBot(formData: FormData): boolean {
  return text(formData, HONEYPOT_FIELD).trim().length > 0;
}

/**
 * Batas laju kiriman. Produksi menegakkannya lewat trigger
 * `enforce_submission_rate_limit()` (migration 0009) — angkanya HARUS sama
 * dengan di SQL. Alasan tiap angka ada di kepala migration itu.
 */
export const SUBMISSION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  perEmail: 3,
  globalPending: 100,
} as const;

export function isSubmissionRateLimited(
  recent: readonly Pick<Submission, 'submittedByEmail' | 'status' | 'createdAt'>[],
  email: string,
  now: Date = new Date(),
): boolean {
  const windowStart = now.getTime() - SUBMISSION_RATE_LIMIT.windowMs;
  const inWindow = recent.filter((s) => new Date(s.createdAt).getTime() >= windowStart);
  const target = email.toLowerCase();
  const byEmail = inWindow.filter((s) => s.submittedByEmail.toLowerCase() === target).length;
  const pending = inWindow.filter((s) => s.status === 'PENDING').length;
  return byEmail >= SUBMISSION_RATE_LIMIT.perEmail || pending >= SUBMISSION_RATE_LIMIT.globalPending;
}

export function parseSubmissionForm(formData: FormData, now: Date = new Date()) {
  const deadlineRaw = text(formData, 'deadlineDate');
  return createSubmissionSchema(now).safeParse({
    submittedByEmail: text(formData, 'email'),
    title: text(formData, 'title'),
    organizer: text(formData, 'organizer'),
    description: text(formData, 'description'),
    eventType: text(formData, 'eventType'),
    registrationLink: text(formData, 'registrationLink'),
    sourceUrl: text(formData, 'sourceUrl'),
    educationLevels: [...new Set(list(formData, 'educationLevels'))],
    categorySlugs: [...new Set(list(formData, 'categorySlugs'))],
    location: text(formData, 'location'),
    isOnline: text(formData, 'isOnline') === 'on',
    deadlineAt: dateInputToDeadlineIso(deadlineRaw) ?? undefined,
  });
}

/**
 * Payload yang dibaca kembali dari JSONB. Bentuknya ditulis aplikasi ini
 * sendiri, tapi kolomnya bisa juga diisi lewat PostgREST langsung oleh siapa
 * pun yang memegang anon key — jadi dibaca sebagai data tak dipercaya.
 */
const storedPayloadSchema = z.object({
  title: z.string().min(1).max(255),
  organizer: z.string().min(1).max(255),
  description: z.string().max(5000).nullable(),
  event_type: z.enum(EVENT_TYPES),
  registration_link: z.string().regex(/^https?:\/\//i),
  source_url: z.string().regex(/^https?:\/\//i).nullable(),
  education_levels: z.array(z.enum(EDUCATION_LEVELS)),
  category_slugs: z.array(z.string()),
  location: z.string().max(120).nullable(),
  is_online: z.boolean(),
  deadline_at: z.string().datetime({ offset: true }),
});

export type StoredSubmissionPayload = z.infer<typeof storedPayloadSchema>;

export function toStoredPayload(payload: SubmissionPayload): StoredSubmissionPayload {
  return {
    title: payload.title,
    organizer: payload.organizer,
    description: payload.description,
    event_type: payload.eventType,
    registration_link: payload.registrationLink,
    source_url: payload.sourceUrl,
    education_levels: [...payload.educationLevels],
    category_slugs: [...payload.categorySlugs],
    location: payload.location,
    is_online: payload.isOnline,
    deadline_at: payload.deadlineAt,
  };
}

export function fromStoredPayload(raw: unknown): SubmissionPayload | null {
  const parsed = storedPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  return {
    title: value.title,
    organizer: value.organizer,
    description: value.description,
    eventType: value.event_type,
    registrationLink: value.registration_link,
    sourceUrl: value.source_url,
    educationLevels: value.education_levels,
    categorySlugs: value.category_slugs,
    location: value.location,
    isOnline: value.is_online,
    deadlineAt: value.deadline_at,
  };
}
