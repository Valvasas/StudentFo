import { z } from 'zod';
import { daysUntil } from '@/lib/deadline';
import { formText, formTrimmed } from '@/lib/form-data';
import { dateInputToDeadlineIso } from '@/lib/submission-schema';
import { VERIFICATION_BADGES, type VerificationBadge } from '@/types/domain';

/** Kontrak promosi lebih dari setahun = salah ketik tahun, bukan kesepakatan. */
export const MAX_PROMOTION_DAYS = 366;

export interface EventPresentationInput {
  readonly eventId: string;
  readonly verificationBadge: VerificationBadge | null;
  /** ISO UTC (23.59 WIB hari terakhir promosi); `null` = hentikan/tanpa promosi. */
  readonly featuredUntil: string | null;
}

/**
 * Form admin "Lencana & promosi" (ADR-049). Lencana kosong = cabut lencana;
 * tanggal kosong = hentikan promosi. Tanggal berakhir 23.59 WIB, sama dengan
 * tenggat kiriman — mitra yang membayar "sampai 10 Oktober" berharap
 * promosinya masih tayang sepanjang 10 Oktober.
 */
export function parsePresentationForm(formData: FormData, now: Date = new Date()) {
  const rawDate = formTrimmed(formData, 'featuredUntil');
  const featuredUntil = rawDate ? dateInputToDeadlineIso(rawDate) : null;

  return z
    .object({
      eventId: z.string().min(1).max(64),
      verificationBadge: z.union([z.enum(VERIFICATION_BADGES), z.literal('').transform(() => null)]),
      featuredUntil: z
        .string()
        .nullable()
        .refine((value) => {
          if (value === null) return true;
          const days = daysUntil(value, now);
          return days !== null && days >= 0 && days <= MAX_PROMOTION_DAYS;
        }),
    })
    .safeParse({
      eventId: formTrimmed(formData, 'eventId'),
      verificationBadge: formText(formData, 'verificationBadge'),
      // Tanggal tak terbaca ≠ "tanpa promosi": dikirim sebagai string rusak
      // supaya ditolak, bukan diam-diam menghentikan promosi berbayar.
      featuredUntil: rawDate ? (featuredUntil ?? 'invalid') : null,
    });
}
