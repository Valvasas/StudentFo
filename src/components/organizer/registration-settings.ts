import { formatRupiah } from '@/lib/currency';
import { cleanText, parseWholeNumber, REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';

const LIMITS = REGISTRATION_FORM_LIMITS;

/**
 * Event yang dikirim pembuat formulir ke `<form>` induk setiap kali susunan
 * pertanyaan berubah — bilah simpan & penjaga "belum disimpan" memakainya.
 * Di modul murni ini (bukan `form-builder.tsx`) karena halaman server juga
 * membacanya: nilai dari modul `'use client'` sampai di server sebagai
 * referensi klien, bukan string.
 */
export const FORM_BUILDER_CHANGE_EVENT = 'sf:form-builder-change';

export const CAPACITY_PATTERN = String.raw`[\s.]*|[0-9.\s]*[1-9][0-9.\s]*`;

export const REGISTRATION_SETTING_NAMES = ['capacity', 'feeAmount', 'paymentInstructions'] as const;
export type RegistrationSettingName = (typeof REGISTRATION_SETTING_NAMES)[number];

/**
 * Pesan untuk isian kuota & biaya yang akan ditolak `parseRegistrationFormInput`
 * ('' = lolos). Penolakan server = pengalihan yang memasang ulang halaman, dan
 * pertanyaan yang belum disimpan ikut hilang — jadi pesannya dipasang sebagai
 * `setCustomValidity` supaya peramban menahan kiriman lebih dulu. Instruksi
 * diukur setelah `cleanText` — normalisasi yang sama dengan server (spasi
 * ganda, markup, karakter tak terlihat).
 *
 * `CAPACITY_PATTERN` = atribut `pattern` kuota: kosong / hanya spasi & titik =
 * tanpa batas (server membacanya null), selain itu wajib ada digit bukan nol.
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
      typeof fee === 'number' && fee > 0 && cleanText(values.paymentInstructions).length < LIMITS.instructionsMin
        ? `Acara berbayar butuh instruksi pembayaran (rekening, e-wallet, atau QRIS) minimal ${LIMITS.instructionsMin} karakter.`
        : '',
  };
}
