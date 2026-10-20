import { z } from 'zod';

/**
 * Status Kebijakan privasi. "Final" hanya bila pemilik mengisi KEDUANYA —
 * alamat kontak resmi pengelola data dan tanggal berlaku — yang artinya ia
 * sudah meninjau isinya (TASKS.md: tinjauan penasihat hukum). Kode tidak
 * pernah menyatakan dokumen hukum final atas nama pemilik.
 */
export type PrivacyPolicyStatus =
  | { readonly final: false }
  | { readonly final: true; readonly contactEmail: string; readonly effectiveDate: string };

const emailSchema = z.string().email().max(254);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function privacyPolicyStatus(input: {
  readonly contactEmail: string | undefined;
  readonly effectiveDate: string | undefined;
}): PrivacyPolicyStatus {
  const contactEmail = emailSchema.safeParse(input.contactEmail?.trim());
  const effectiveDate = dateSchema.safeParse(input.effectiveDate?.trim());
  if (!contactEmail.success || !effectiveDate.success) return { final: false };
  // Tanggal 2026-02-31 lolos regex tapi bukan tanggal; Date menggesernya ke Maret.
  const parsed = new Date(`${effectiveDate.data}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== effectiveDate.data) return { final: false };
  return { final: true, contactEmail: contactEmail.data, effectiveDate: effectiveDate.data };
}
