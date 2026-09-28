import { z } from 'zod';
import { daysUntil, jakartaDateKey } from '@/lib/deadline';
import { formList, formText } from '@/lib/form-data';
import { dateInputToDeadlineIso } from '@/lib/submission-schema';
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  type EventDetail,
  type EventRevisionChanges,
  type OrganizerStatus,
} from '@/types/domain';

/**
 * Logika murni fitur penyelenggara (ADR-042). Batas panjang MENCERMINKAN
 * CHECK di migration 20260928110001 — validasi yang lebih longgar dari
 * kolomnya baru gagal di database, jauh dari orang yang bisa memperbaikinya.
 */

export const ORGANIZER_LIMITS = {
  orgNameMax: 160,
  evidenceMin: 20,
  evidenceMax: 1000,
  noteMax: 500,
  descriptionMax: 5000,
  locationMax: 120,
  /** Sama dengan submission-schema: salah ketik tahun, bukan rencana nyata. */
  maxDeadlineDays: 3 * 366,
} as const;

const httpsUrl = z
  .string()
  .trim()
  .max(500, 'Tautan terlalu panjang.')
  .url('Tautan harus alamat web lengkap, diawali https://')
  .refine((value) => /^https:\/\/\S+$/i.test(value), 'Tautan harus diawali https:// (bukan http://).');

export const organizerApplicationSchema = z.object({
  orgName: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Nama lembaga minimal 2 karakter.').max(ORGANIZER_LIMITS.orgNameMax, 'Nama lembaga maksimal 160 karakter.')),
  website: z.union([httpsUrl, z.literal('').transform(() => null)]),
  evidence: z
    .string()
    .trim()
    .min(ORGANIZER_LIMITS.evidenceMin, 'Jelaskan peranmu minimal 20 karakter, sertakan tautan bukti.')
    .max(ORGANIZER_LIMITS.evidenceMax, 'Penjelasan maksimal 1000 karakter.'),
});
export type OrganizerApplicationInput = z.infer<typeof organizerApplicationSchema>;

export function parseOrganizerApplication(formData: FormData) {
  return organizerApplicationSchema.safeParse({
    orgName: formText(formData, 'orgName'),
    website: formText(formData, 'website'),
    evidence: formText(formData, 'evidence'),
  });
}

export const eventClaimSchema = z.object({
  eventId: z.string().uuid('Acara tidak dikenali.'),
  evidence: z
    .string()
    .trim()
    .min(ORGANIZER_LIMITS.evidenceMin, 'Jelaskan hubungan lembagamu dengan acara ini (min. 20 karakter).')
    .max(ORGANIZER_LIMITS.evidenceMax, 'Penjelasan maksimal 1000 karakter.'),
});

/**
 * Permintaan perubahan hanya membawa kolom yang BENAR-BENAR berubah
 * dibanding acara saat ini — moderator membaca selisih, bukan seluruh form,
 * dan permintaan tanpa perubahan apa pun ditolak sebelum masuk antrean.
 */
export function buildRevisionChanges(
  event: Pick<EventDetail, 'description' | 'registrationLink' | 'location' | 'isOnline' | 'educationLevels' | 'primaryDeadlineAt'>,
  formData: FormData,
  now: Date = new Date(),
):
  | { ok: true; changes: EventRevisionChanges; note: string | null }
  | { ok: false; error: 'invalid_revision' | 'revision_empty' | 'revision_deadline' } {
  const description = formText(formData, 'description').trim();
  const registrationLink = formText(formData, 'registrationLink').trim();
  const location = formText(formData, 'location').trim();
  const isOnline = formText(formData, 'isOnline') === 'on';
  const levels = [...new Set(formList(formData, 'educationLevels'))].filter((level): level is EducationLevel =>
    (EDUCATION_LEVELS as readonly string[]).includes(level),
  );
  const deadlineRaw = formText(formData, 'deadlineDate').trim();
  const note = formText(formData, 'note').trim().slice(0, ORGANIZER_LIMITS.noteMax) || null;

  if (description.length > ORGANIZER_LIMITS.descriptionMax || location.length > ORGANIZER_LIMITS.locationMax) {
    return { ok: false, error: 'invalid_revision' };
  }
  if (registrationLink && !httpsUrl.safeParse(registrationLink).success) return { ok: false, error: 'invalid_revision' };
  if (levels.length === 0) return { ok: false, error: 'invalid_revision' };

  const changes: { -readonly [K in keyof EventRevisionChanges]: EventRevisionChanges[K] } = {};
  if ((description || null) !== (event.description ?? null)) changes.description = description || null;
  if (registrationLink && registrationLink !== event.registrationLink) changes.registrationLink = registrationLink;
  if ((location || null) !== (event.location ?? null)) changes.location = location || null;
  if (isOnline !== event.isOnline) changes.isOnline = isOnline;
  if ([...levels].sort().join() !== [...event.educationLevels].sort().join()) changes.educationLevels = levels;

  if (deadlineRaw) {
    const iso = dateInputToDeadlineIso(deadlineRaw);
    const days = iso ? daysUntil(iso, now) : null;
    if (!iso || days === null || days < 1 || days > ORGANIZER_LIMITS.maxDeadlineDays) {
      return { ok: false, error: 'revision_deadline' };
    }
    // Dibandingkan per hari kalender WIB (AGENTS.md §8), bukan potongan ISO UTC.
    const current = event.primaryDeadlineAt ? jakartaDateKey(new Date(event.primaryDeadlineAt)) : null;
    if (jakartaDateKey(new Date(iso)) !== current) changes.deadlineAt = iso;
  }

  if (Object.keys(changes).length === 0) return { ok: false, error: 'revision_empty' };
  return { ok: true, changes, note };
}

/** Bentuk JSONB kolom `event_revisions.changes` (snake_case, dibaca RPC penerap). */
export function toStoredRevisionChanges(changes: EventRevisionChanges): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  if ('description' in changes) stored.description = changes.description ?? null;
  if (changes.registrationLink !== undefined) stored.registration_link = changes.registrationLink;
  if ('location' in changes) stored.location = changes.location ?? null;
  if (changes.isOnline !== undefined) stored.is_online = changes.isOnline;
  if (changes.educationLevels !== undefined) stored.education_levels = [...changes.educationLevels];
  if (changes.deadlineAt !== undefined) stored.deadline_at = changes.deadlineAt;
  return stored;
}

const storedRevisionSchema = z
  .object({
    description: z.string().max(ORGANIZER_LIMITS.descriptionMax).nullable().optional(),
    registration_link: z.string().regex(/^https:\/\/\S+$/i).optional(),
    location: z.string().max(ORGANIZER_LIMITS.locationMax).nullable().optional(),
    is_online: z.boolean().optional(),
    education_levels: z.array(z.enum(EDUCATION_LEVELS)).optional(),
    deadline_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

/** JSONB dari database = data tak dipercaya (bisa ditulis siapa pun yang memegang sesi pengelola). */
export function fromStoredRevisionChanges(raw: unknown): EventRevisionChanges | null {
  const parsed = storedRevisionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  return {
    ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.registration_link !== undefined ? { registrationLink: value.registration_link } : {}),
    ...(value.location !== undefined ? { location: value.location } : {}),
    ...(value.is_online !== undefined ? { isOnline: value.is_online } : {}),
    ...(value.education_levels !== undefined ? { educationLevels: value.education_levels } : {}),
    ...(value.deadline_at !== undefined ? { deadlineAt: value.deadline_at } : {}),
  };
}

export const ORGANIZER_STATUS_LABEL: Record<OrganizerStatus, string> = {
  PENDING: 'Menunggu verifikasi',
  VERIFIED: 'Terverifikasi',
  REJECTED: 'Belum terverifikasi',
  REVOKED: 'Dicabut',
};

/**
 * Batas laju yang ditegakkan trigger di migration 20260928110001 — HARUS
 * sama dengan angka di SQL (mode seed mencerminkannya).
 */
export const ORGANIZER_RATE_LIMITS = {
  profileWritesPerDay: 5,
  claimsPerDay: 10,
  revisionsPerDay: 20,
} as const;
