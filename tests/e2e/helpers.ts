import { expect, type Page } from '@playwright/test';

export type PersonaLabel = 'Mahasiswa' | 'Siswa baru' | 'Admin moderator';

/** Masuk lewat kartu persona demo, persis seperti pengunjung sungguhan. */
export async function signInAsDemo(page: Page, persona: PersonaLabel, next = '/'): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: new RegExp(`^Masuk sebagai ${persona}:`) }).click();
  await expect(page).toHaveURL(new RegExp(`${next === '/' ? '/$' : next.replace(/[/?]/g, '\\$&')}`));
  // Setelah redirect Server Action, Next menavigasi di klien dan <title>
  // di-stream sesaat SETELAH URL berubah — tunggu sampai terpasang supaya
  // audit tidak memotret halaman di tengah transisi.
  await expect(page).toHaveTitle(/\S/);
}
