import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { mapSupabaseAuthError } from '@/lib/auth-messages';
import { dataMode, siteUrl } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Titik pendaratan semua tautan autentikasi: kembalinya OAuth Google,
 * konfirmasi email pendaftaran, dan tautan penyetelan ulang kata sandi.
 *
 * Dua format ditangani di satu rute karena Supabase mengirim keduanya
 * tergantung template email yang dipakai project:
 *  - `?code=…`                 alur PKCE (default; juga dipakai OAuth)
 *  - `?token_hash=…&type=…`    template email yang memakai `{{ .TokenHash }}`
 *
 * Route Handler — bukan Server Component — karena hanya di sini (dan di
 * Server Action) cookie sesi boleh ditulis.
 */

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function parseOtpType(value: string | null): EmailOtpType | null {
  return OTP_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function destination(next: string, notice?: string): URL {
  // `next` sudah lolos safeNextPath(), jadi selalu path internal — basis
  // siteUrl tidak bisa ditimpa oleh URL absolut dari penyerang.
  const url = new URL(next, siteUrl);
  if (notice) url.searchParams.set('notice', notice);
  return url;
}

function failure(code: string): URL {
  const url = new URL('/login', siteUrl);
  url.searchParams.set('error', code);
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get('next'));

  if (dataMode === 'seed') {
    return NextResponse.redirect(failure('unavailable'));
  }

  // Google mengembalikan `?error=access_denied` kalau pengguna membatalkan
  // di layar consent. Itu bukan kegagalan sistem, jadi tidak dicatat sebagai
  // error — pengguna cukup dikembalikan ke halaman masuk.
  if (searchParams.get('error')) {
    return NextResponse.redirect(new URL('/login', siteUrl));
  }

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = parseOtpType(searchParams.get('type'));

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(failure(mapSupabaseAuthError(error)));
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
    if (error) return NextResponse.redirect(failure(mapSupabaseAuthError(error)));
  } else {
    return NextResponse.redirect(failure('invalid_link'));
  }

  return NextResponse.redirect(
    destination(next, otpType === 'signup' ? 'email_confirmed' : undefined),
  );
}
