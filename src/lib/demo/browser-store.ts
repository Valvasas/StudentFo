/**
 * Penyimpanan peramban untuk fitur yang baru ada antarmukanya (ADR-039).
 * Setiap baca divalidasi: localStorage bisa diubah siapa saja, dan mode
 * penyamaran bisa melempar exception saat diakses.
 */
export const DEMO_STORE_EVENT = 'sf-demo-store';
export const DEMO_UNREAD_KEY = 'sf-demo-unread';
export const DEMO_UNREAD_DEFAULT = 3;

export function readDemoJson<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeDemoJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan diblokir atau penuh: perubahan tetap berlaku di layar
    // untuk sesi ini, hanya tidak bertahan setelah muat ulang.
  }
  window.dispatchEvent(new Event(DEMO_STORE_EVENT));
}

export function readDemoNumber(key: string, fallback: number): number {
  return readDemoJson(key, fallback, (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
