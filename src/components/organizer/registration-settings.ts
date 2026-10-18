import { formatRupiah } from '@/lib/currency';
import { parseWholeNumber, REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';

const LIMITS = REGISTRATION_FORM_LIMITS;

export const REGISTRATION_SETTING_NAMES = ['capacity', 'feeAmount', 'paymentInstructions'] as const;
export type RegistrationSettingName = (typeof REGISTRATION_SETTING_NAMES)[number];

/**
 * Pesan untuk isian kuota & biaya yang akan ditolak `parseRegistrationFormInput`
 * ('' = lolos). Penolakan server = pengalihan yang memasang ulang halaman, dan
 * pertanyaan yang belum disimpan ikut hilang — jadi pesannya dipasang sebagai
 * `setCustomValidity` supaya peramban menahan kiriman lebih dulu. Server tetap
 * gerbangnya (mis. markup di instruksi baru dilucuti di sana).
 */
export function registrationSettingsIssues(values: Record<RegistrationSettingName, string>): Record<RegistrationSettingName, string> {
  const capacity = parseWholeNumber(values.capacity.trim(), LIMITS.capacityMax);
  const fee = parseWholeNumber(values.feeAmount.trim(), LIMITS.feeMax);
  return {
    capacity:
      capacity === null || (capacity !== 'invalid' && capacity >= 1)
        ? ''
        : `Isi kuota 1–${LIMITS.capacityMax.toLocaleString('id-ID')}, atau kosongkan bila tanpa batas.`,
    // Satu pesan untuk "bukan angka" (mis. "Rp 50.000", "50rb") dan "terlalu
    // besar": setCustomValidity menimpa pesan bawaan peramban untuk keduanya.
    feeAmount: fee === 'invalid' ? `Isi biaya dengan angka saja, maksimal ${formatRupiah(LIMITS.feeMax)}.` : '',
    paymentInstructions:
      typeof fee === 'number' && fee > 0 && values.paymentInstructions.trim().length < LIMITS.instructionsMin
        ? `Acara berbayar butuh instruksi pembayaran (rekening, e-wallet, atau QRIS) minimal ${LIMITS.instructionsMin} karakter.`
        : '',
  };
}
