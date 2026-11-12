import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Tanya jawab kegiatan (ADR-062 #7), sebagai alur nyata: peserta bertanya →
 * penyelenggara terverifikasi menjawab → orang lain melapor → admin
 * menyembunyikan. Data demo dibagi proyek: cukup satu proyek, teks unik.
 */
const EVENT = '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

test('tamu melihat gerbang anggota di tab Tanya jawab, dan masuk membawanya kembali ke tab itu', async ({ page }) => {
  await page.goto(`${EVENT}?tab=tanya`);
  const gate = page.getByRole('region', { name: 'Tanya jawab khusus anggota' });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole('link', { name: 'Masuk', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`${EVENT}?tab=tanya`)}`);
  // Isi tanya jawab tidak dirender untuk tamu (ADR-085).
  await expect(page.getByRole('heading', { level: 2, name: 'Tanya jawab', exact: true })).toHaveCount(0);
  await expect(page.locator('#tanya')).toHaveCount(0);
});

test('tanya → dijawab penyelenggara → dilaporkan → disembunyikan admin', async ({ browser }) => {
  const token = `uji-tanya-${Date.now()}`;
  const [askerContext, orgContext, reporterContext, adminContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [asker, org, reporter, admin] = await Promise.all([askerContext.newPage(), orgContext.newPage(), reporterContext.newPage(), adminContext.newPage()]);

  await signInAsDemo(asker, 'Mahasiswa', `${EVENT}?tab=tanya`);
  await asker.getByLabel('Pertanyaanmu').fill(`Apakah boleh tim lintas kampus? ${token}`);
  await asker.getByRole('button', { name: 'Kirim pertanyaan' }).click();
  await expect(asker).toHaveURL(/tab=tanya.*notice=question_sent/);
  const mine = asker.locator('#tanya li').filter({ hasText: token });
  await expect(mine).toContainText('(kamu)');
  await expect(mine).toContainText('Belum dijawab');

  await signInAsDemo(org, 'Penyelenggara', `${EVENT}?tab=tanya`);
  const toAnswer = org.locator('#tanya li').filter({ hasText: token });
  await toAnswer.getByText('Jawab pertanyaan ini').click();
  await toAnswer.getByLabel('Jawaban (tampil publik)').fill(`Boleh, maksimal tiga orang. ${token}`);
  await toAnswer.getByRole('button', { name: 'Simpan jawaban' }).click();
  await expect(org).toHaveURL(/notice=question_answered/);

  await asker.reload();
  await expect(mine).toContainText('Jawaban penyelenggara');
  await expect(mine).toContainText(`Boleh, maksimal tiga orang. ${token}`);

  await signInAsDemo(reporter, 'Siswa baru', `${EVENT}?tab=tanya`);
  await reporter.locator('#tanya li').filter({ hasText: token }).getByRole('link', { name: 'Laporkan' }).click();
  await expect(reporter.getByRole('heading', { level: 1, name: 'Laporkan pertanyaan' })).toBeVisible();
  await reporter.getByRole('radio', { name: /Spam/ }).check();
  await reporter.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(reporter).toHaveURL(/tab=tanya.*notice=report_sent/);

  await signInAsDemo(admin, 'Admin moderator', '/admin/laporan');
  const report = admin.locator('main li').filter({ hasText: token }).first();
  await report.getByLabel(/Sembunyikan pertanyaan ini/).check();
  await report.getByRole('button', { name: 'Tandai sudah ditindak' }).click();
  await expect(admin.getByText(/Laporan ditandai sudah ditindak/)).toBeVisible();

  await asker.reload();
  await expect(asker.locator('#tanya li').filter({ hasText: token })).toHaveCount(0);

  await Promise.all([askerContext, orgContext, reporterContext, adminContext].map((context) => context.close()));
});
