import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Menu akun yang bisa dilipat (ADR-052): sakelarnya <form> + cookie, jadi
 * keadaan terlipat harus bertahan antarhalaman dan kembali ke halaman asal.
 * Menu samping hanya ada di ≥ 960px — ponsel memakai menu akun di navbar.
 */
test('menu akun bisa dilipat jadi rel ikon dan dibuka lagi', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'ponsel', 'menu samping tersembunyi di bawah 960px');
  await signInAsDemo(page, 'Mahasiswa', '/tracker');
  const menu = page.getByRole('navigation', { name: 'Menu akun' });

  await menu.getByRole('button', { name: 'Ciutkan menu akun' }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  await expect(menu.getByRole('button', { name: 'Lebarkan menu akun' })).toHaveAttribute('aria-expanded', 'false');
  // Label tetap ada untuk pembaca layar walau hanya ikon yang tampil.
  await expect(menu.getByRole('link', { name: 'Pendaftaran' })).toHaveAttribute('aria-current', 'page');

  await menu.getByRole('link', { name: 'Pengaturan' }).click();
  await expect(page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Lebarkan menu akun' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Lebarkan menu akun' }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/);
  await expect(page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Ciutkan menu akun' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
