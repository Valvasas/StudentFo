import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_TEMPLATES } from './auth-email-templates';

const file = (key: string) => readFileSync(new URL(`../../../supabase/templates/${key}.html`, import.meta.url), 'utf8');
const callbackSource = readFileSync(new URL('../../app/auth/callback/route.ts', import.meta.url), 'utf8');

describe('template email Supabase Auth (ADR-078)', () => {
  it('berkas di supabase/templates sama persis dengan sumbernya — jalankan `npm run email:templates` bila gagal', () => {
    for (const template of AUTH_EMAIL_TEMPLATES) expect(file(template.key), template.key).toBe(template.html);
  });

  it('tautan memakai token_hash ke /auth/callback dengan type yang diterima callback', () => {
    const accepted = [...callbackSource.matchAll(/^\s+'([a-z_]+)',$/gm)].map((match) => match[1]);
    for (const template of AUTH_EMAIL_TEMPLATES) {
      const links = [...template.html.matchAll(/\/auth\/callback\?token_hash=\{\{ \.TokenHash \}\}&type=([a-z_]+)&next=([^"&<\s]+)/g)];
      for (const [, type, next] of links) {
        expect(accepted, `${template.key}: type ${type}`).toContain(type);
        expect(decodeURIComponent(next!), template.key).toMatch(/^\/[a-z/-]*$/);
      }
      if (!['reauthentication', 'password_changed_notification', 'email_changed_notification'].includes(template.key)) {
        expect(links.length, `${template.key} butuh tautan konfirmasi`).toBeGreaterThan(0);
      }
    }
  });

  it('PKCE ConfirmationURL tidak dipakai (gagal saat email dibuka di perangkat lain); kode OTP tidak di subjek', () => {
    for (const template of AUTH_EMAIL_TEMPLATES) {
      expect(template.html, template.key).not.toContain('{{ .ConfirmationURL }}');
      expect(template.subject, template.key).not.toContain('{{ .Token }}');
    }
    expect(AUTH_EMAIL_TEMPLATES.find((template) => template.key === 'reauthentication')?.html).toContain('{{ .Token }}');
  });

  it('bahasa Indonesia, peringatan anti-penipuan, dan tautan cadangan berupa teks', () => {
    for (const template of AUTH_EMAIL_TEMPLATES) {
      expect(template.html).toContain('<html lang="id">');
      expect(template.html).toContain('tidak pernah meminta kata sandi');
      if (template.html.includes('token_hash')) expect(template.html, template.key).toContain('Tombol tidak berfungsi?');
    }
  });
});
