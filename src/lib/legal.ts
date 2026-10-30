import { z } from 'zod';

/**
 * Revisi TEKS dokumen hukum (Kebijakan privasi, Kebijakan cookie, Syarat &
 * Ketentuan). Naikkan setiap kali isinya berubah: nilai ini dicatat sebagai
 * bukti persetujuan saat daftar (UU PDP Pasal 24), jadi harus menunjuk teks
 * yang benar-benar dibaca pengguna. Berbeda dari tanggal berlaku, yang
 * diisi pemilik lewat env setelah meninjau.
 */
export const LEGAL_REVISION = '2026-10-30';

/** Nama pengelola selama pemilik belum mengisi `LEGAL_OPERATOR_NAME`. */
export const DEFAULT_OPERATOR_NAME = 'Pengelola StudentFo';

/**
 * "Final" hanya bila pemilik mengisi KETIGANYA — identitas pengelola
 * (pengendali data, UU PDP Pasal 5), alamat kontak resmi, dan tanggal berlaku
 * — yang artinya ia sudah meninjau isinya (TASKS.md: tinjauan penasihat
 * hukum). Kode tidak pernah menyatakan dokumen hukum final atas nama pemilik.
 */
export type LegalDocumentStatus =
  | { readonly final: false; readonly operatorName: string }
  | { readonly final: true; readonly operatorName: string; readonly contactEmail: string; readonly effectiveDate: string };

const operatorSchema = z.string().min(2).max(160);
const emailSchema = z.string().email().max(254);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function legalDocumentStatus(input: {
  readonly operatorName: string | undefined;
  readonly contactEmail: string | undefined;
  readonly effectiveDate: string | undefined;
}): LegalDocumentStatus {
  const operator = operatorSchema.safeParse(input.operatorName?.trim());
  const operatorName = operator.success ? operator.data : DEFAULT_OPERATOR_NAME;
  const contactEmail = emailSchema.safeParse(input.contactEmail?.trim());
  const effectiveDate = dateSchema.safeParse(input.effectiveDate?.trim());
  if (!operator.success || !contactEmail.success || !effectiveDate.success) return { final: false, operatorName };
  // Tanggal 2026-02-31 lolos regex tapi bukan tanggal; Date menggesernya ke Maret.
  const parsed = new Date(`${effectiveDate.data}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== effectiveDate.data) return { final: false, operatorName };
  return { final: true, operatorName, contactEmail: contactEmail.data, effectiveDate: effectiveDate.data };
}

/**
 * Bukti persetujuan yang disimpan di metadata akun saat daftar. Metadata itu
 * bisa diubah pemiliknya sendiri, jadi ini catatan, bukan kontrol akses —
 * stempel waktu server `auth.users.created_at` tetap pembandingnya.
 */
export interface LegalConsentRecord {
  readonly revision: string;
  readonly at: string;
  /** Menyatakan ≥ 18 tahun, atau 13–17 tahun dengan izin orang tua/wali. */
  readonly age_confirmed: true;
  readonly via: 'email' | 'google';
}

export function legalConsentRecord(via: LegalConsentRecord['via'], now: Date = new Date()): LegalConsentRecord {
  return { revision: LEGAL_REVISION, at: now.toISOString(), age_confirmed: true, via };
}
