/**
 * Pembacaan FormData yang seragam untuk seluruh Server Action.
 *
 * `formData.get()` bisa mengembalikan `File` (field yang sama dikirim sebagai
 * unggahan oleh klien yang tidak kita tulis) atau `null`. Keduanya
 * diperlakukan sebagai string kosong — bukan di-`toString()` jadi
 * "[object File]" yang lolos validasi panjang.
 */

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export function formTrimmed(formData: FormData, name: string): string {
  return formText(formData, name).trim();
}

/**
 * Plafon jumlah nilai satu kolom berulang. Batas sah terbesar di aplikasi = 20
 * (penerima Bagikan); semua validator punya `.max()` sendiri yang lebih kecil,
 * jadi daftar yang dipotong di sini tetap DITOLAK oleh validatornya. Gunanya:
 * badan 32 MB tidak bisa menyodorkan jutaan elemen ke zod v3, yang memproses
 * seluruh array sebelum mengecek `.max()` (GHSA-mrhx-c7xc-m3w5).
 */
export const FORM_LIST_MAX = 200;

export function formList(formData: FormData, name: string): string[] {
  const values: string[] = [];
  for (const value of formData.getAll(name)) {
    if (typeof value !== 'string') continue;
    values.push(value);
    if (values.length >= FORM_LIST_MAX) break;
  }
  return values;
}

/**
 * Awalan kunci sessionStorage penahan isian form akun (`FieldMemory`).
 * Di sini, bukan di komponennya: modul `'use client'` yang diimpor Server
 * Component (Kebijakan cookie) memberi referensi klien, bukan nilai string.
 */
export const FIELD_MEMORY_PREFIX = 'sf_form:';
