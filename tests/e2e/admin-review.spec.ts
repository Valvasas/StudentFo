import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Admin wajib bisa membandingkan hasil ekstraksi LLM dengan sumber aslinya
 * tanpa meninggalkan antrean. Kartu tanpa tautan sumber = persetujuan buta.
 */
test('setiap kartu antrean moderasi menampilkan domain & tautan sumber serta tautan pendaftaran', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const cards = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /Setujui/ }) });
  await expect(cards.first()).toBeVisible();

  const eventCards = cards.filter({ hasNot: page.getByText(/^Dikirim /) });
  const count = await eventCards.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const card = eventCards.nth(i);
    const source = card.getByRole('link', { name: /^Sumber asli/ });
    await expect(source).toHaveAttribute('href', /^https?:\/\//);
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(source).toHaveAttribute('rel', /noopener/);
    await expect(card.getByRole('link', { name: /^Tautan pendaftaran/ })).toHaveAttribute('href', /^https?:\/\//);
  }
});
