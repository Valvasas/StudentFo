import { describe, expect, it } from 'vitest';
import { supabaseCookieOptions } from './cookie-options';

describe('supabaseCookieOptions', () => {
  it('token sesi tidak pernah terbaca JavaScript halaman (tidak ada klien Supabase di browser, ADR-010)', () => {
    expect(supabaseCookieOptions('production').httpOnly).toBe(true);
    expect(supabaseCookieOptions('development').httpOnly).toBe(true);
  });

  it('Secure hanya di produksi; SameSite=Lax supaya kembali dari Google/tautan email tetap membawa sesi', () => {
    expect(supabaseCookieOptions('production')).toMatchObject({ secure: true, sameSite: 'lax', path: '/' });
    expect(supabaseCookieOptions('development').secure).toBe(false);
  });
});
