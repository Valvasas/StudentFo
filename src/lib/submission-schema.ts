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

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2000, 'Tautan terlalu panjang.')
  .url('Tautan harus berupa alamat web lengkap, diawali https://')
  .refine((value) => /^https:\/\//i.test(value), 'Tautan harus diawali https://');

/** Kolom URL opsional: kosong → null. */
const optionalUrl = (schema: z.ZodType<string>) => z.union([schema, z.literal('').transform(() => null)]);

/**
 * Buang markup & karakter tak terlihat dari teks bebas kiriman.
 *
 * React memang meng-escape semua teks saat render, tapi isi kiriman juga
 * mengalir ke tempat yang TIDAK di-escape React: berkas .ics, payload bot
 * Telegram/WhatsApp (mode HTML/Markdown), email. `<a href=…>` di judul akan
 * menjadi tautan aktif di salah satu kanal itu. Karakter kendali dua arah
 * (U+202E dkk) membalik tampilan teks — trik klasik menyamarkan domain palsu.
 *
 * Hanya `<` yang diikuti huruf atau `/` yang dianggap tag, jadi "IPK < 3,5"
 * tetap utuh.
 */
export function stripMarkup(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ');
}

/** Teks satu baris: markup dibuang, spasi dirapikan, LALU batas panjang dicek. */
const plainLine = () =>
  z
    .string()
    .transform((value) => stripMarkup(value).replace(/\s+/g, ' ').trim());

const optionalText = (max: number, message: string) =>
  z
    .string()
    .transform((value) => stripMarkup(value).trim())
    .pipe(z.string().max(max, message))
    .transform((value) => (value.length === 0 ? null : value));

/** Batas atas nominal = CHECK `events_price_consistent` (migration 20261003100001). */
export const MAX_PRICE_AMOUNT = 1_000_000_000;

/**
 * "Rp 150.000", "150000", "150.000,00" → 150000. Kosong → null (berbayar,
 * nominal belum diumumkan). Sen dibuang dulu SEBELUM membuang pemisah ribuan;
 * kalau tidak, "150.000,50" terbaca 15.000.050.
 */
export function parsePriceInput(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/,\d{1,2}$/, '').replace(/[^\d]/g, '');
  if (digits.length === 0 || digits.length > 10) return 'invalid';
  const amount = Number(digits);
  return amount >= 1 && amount <= MAX_PRICE_AMOUNT ? amount : 'invalid';
}

export const COST_TYPES = ['free', 'paid', 'unknown'] as const;

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
    title: plainLine().pipe(
      z.string().min(6, 'Judul kegiatan minimal 6 karakter.').max(255, 'Judul kegiatan maksimal 255 karakter.'),
    ),
    organizer: plainLine().pipe(
      z.string().min(2, 'Nama penyelenggara minimal 2 karakter.').max(255, 'Nama penyelenggara maksimal 255 karakter.'),
    ),
    description: optionalText(5000, 'Deskripsi maksimal 5000 karakter.'),
    eventType: z.enum(EVENT_TYPES, { message: 'Pilih jenis kegiatan.' }),
    registrationLink: httpUrlSchema,
    sourceUrl: optionalUrl(httpUrlSchema),
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
    costType: z.enum(COST_TYPES, { message: 'Pilih status biaya pendaftaran.' }),
    priceAmount: z.union([z.number(), z.null(), z.literal('invalid')]),
    guidebookUrl: optionalUrl(httpsUrlSchema),
    organizerContact: optionalText(120, 'Kontak penyelenggara maksimal 120 karakter.'),
    proofLink: optionalUrl(httpUrlSchema),
  })
    .superRefine((value, ctx) => {
      if (value.costType === 'paid' && value.priceAmount === 'invalid') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priceAmount'], message: 'Nominal biaya tidak valid.' });
      }
    })
    .transform(({ costType, priceAmount, ...rest }) => ({
      ...rest,
      isFree: costType === 'unknown' ? null : costType === 'free',
      // Nominal hanya bermakna untuk "berbayar"; isian nominal dengan
      // pilihan "gratis" diabaikan, bukan disimpan sebagai data yang
      // saling membantah (CHECK events_price_consistent akan menolaknya).
      priceAmount: costType === 'paid' && typeof priceAmount === 'number' ? priceAmount : null,
    }));
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
    costType: text(formData, 'costType'),
    priceAmount: parsePriceInput(text(formData, 'priceAmount')),
    guidebookUrl: text(formData, 'guidebookUrl'),
    organizerContact: text(formData, 'organizerContact'),
    proofLink: text(formData, 'proofLink'),
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
  // Kunci-kunci di bawah lahir di migration 20261003100001; kiriman yang
  // lebih tua tidak memilikinya dan tetap harus terbaca (→ null).
  is_free: z.boolean().nullable().optional(),
  price_amount: z.number().positive().max(MAX_PRICE_AMOUNT).nullable().optional(),
  guidebook_url: z.string().regex(/^https:\/\//i).max(2000).nullable().optional(),
  organizer_contact: z.string().max(120).nullable().optional(),
  proof_link: z.string().regex(/^https?:\/\//i).max(2000).nullable().optional(),
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
    is_free: payload.isFree,
    price_amount: payload.priceAmount,
    guidebook_url: payload.guidebookUrl,
    organizer_contact: payload.organizerContact,
    proof_link: payload.proofLink,
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
    isFree: value.is_free ?? null,
    priceAmount: value.is_free === false ? (value.price_amount ?? null) : null,
    guidebookUrl: value.guidebook_url ?? null,
    organizerContact: value.organizer_contact ?? null,
    proofLink: value.proof_link ?? null,
  };
}
