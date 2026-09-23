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

export function formList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string');
}
