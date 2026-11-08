/**
 * Kunci tautan persona Admin demo untuk server uji (`playwright.config.ts`
 * memasangnya sebagai DEMO_ADMIN_KEY). Hanya berlaku di server uji lokal.
 */
export const DEMO_ADMIN_TEST_KEY = 'kunci-uji-demo-admin';

/**
 * Pengingat email di server uji (ADR-062 #6): ketiganya harus diisi bersamaan.
 * Kunci Resend palsu — rute pengirim tetap menolak tanpa CRON_SECRET, jadi
 * tidak ada email yang benar-benar dikirim.
 */
export const EMAIL_LINK_TEST_SECRET = 'kunci-uji-tautan-email-minimal-32-karakter';
export const EMAIL_TEST_ENV = {
  RESEND_API_KEY: 're_uji_tidak_pernah_dipakai',
  EMAIL_FROM: 'StudentFo Uji <pengingat@studentfo.test>',
  EMAIL_LINK_SECRET: EMAIL_LINK_TEST_SECRET,
} as const;
