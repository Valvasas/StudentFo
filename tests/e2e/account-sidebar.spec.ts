import { expect, type Locator, test } from '@playwright/test';
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
  // Tombol "Lebarkan" juga ada di halaman LAMA yang tetap tampil selama
  // navigasi; tanpa menunggu URL, klik berikutnya bisa mengenai form halaman
  // lama (returnTo=/tracker) saat server sedang sibuk.
  await expect(page).toHaveURL(/\/profile\/settings$/);
  await expect(page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Lebarkan menu akun' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Lebarkan menu akun' }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/);
  await expect(page.getByRole('navigation', { name: 'Menu akun' }).getByRole('button', { name: 'Ciutkan menu akun' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

/**
 * Menu samping & dropdown navbar dibangun dari `accountMenuGroups` yang sama
 * (ADR-055/056): urutan tujuan harus sama, dan tujuan utama peran di atas.
 */
test('menu samping & dropdown akun: isi dan urutan sama, ruang kerja di atas untuk penyelenggara', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'ponsel', 'menu samping tersembunyi di bawah 960px');
  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara');
  await page.goto('/profile/settings');
  // Bukan /profile & /profile/details: keduanya juga tujuan kartu profil & ajakan melengkapi di kepala menu.
  const destinations = ['/penyelenggara', '/tracker', '/pembayaran', '/profile/interests', '/profile/settings'];
  const orderIn = async (links: Locator) => {
    const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    return destinations.map((href) => hrefs.indexOf(href));
  };

  const sidebar = await orderIn(page.getByRole('navigation', { name: 'Menu akun' }).locator('a'));
  expect(sidebar).not.toContain(-1);
  expect([...sidebar].sort((a, b) => a - b)).toEqual(sidebar);

  const menu = page.locator('details:has(> summary[aria-label^="Menu akun"])');
  await menu.locator('summary').click();
  const dropdown = await orderIn(menu.locator('a'));
  expect(dropdown).not.toContain(-1);
  expect([...dropdown].sort((a, b) => a - b)).toEqual(dropdown);
});
