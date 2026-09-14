/**
 * Pesan untuk alur akun — kegagalan maupun kabar baik.
 *
 * Tiga aturan yang dipegang di sini:
 *
 * 1. PESAN TIDAK BOLEH MEMBOCORKAN APAKAH SEBUAH EMAIL TERDAFTAR.
 *    "Kata sandi salah" dan "email tidak ditemukan" adalah dua jawaban
 *    berbeda bagi penyerang yang sedang menyusun daftar akun yang valid —
 *    daftar itu yang nanti dipakai untuk credential stuffing. Keduanya
 *    dipetakan ke satu pesan yang sama.
 *
 * 2. KODE YANG DIOPER LEWAT URL, BUKAN TEKSNYA.
 *    Form akun memakai redirect (`?error=invalid_credentials`) supaya tetap
 *    berfungsi tanpa JavaScript. Yang berkeliaran di URL hanyalah kode dari
 *    daftar tertutup di bawah; kalimatnya dirakit di server. Kalau teks
 *    pesannya sendiri yang dioper, siapa pun bisa membuat halaman kita
 *    menampilkan kalimat karangan ("Akun diblokir, hubungi wa.me/…") —
 *    lengkap dengan alamat domain kita sebagai penjamin.
 *
 * 3. KODE TIDAK DIKENAL = TIDAK MENAMPILKAN APA-APA, bukan error.
 */

export const AUTH_ERROR_CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'weak_password',
  'same_password',
  'rate_limited',
  'provider_disabled',
  'invalid_link',
  'session_missing',
  'validation',
  'unavailable',
  'unknown',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_ERROR_MESSAGE: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Email atau kata sandi salah.',
  email_not_confirmed:
    'Email kamu belum dikonfirmasi. Buka tautan yang kami kirim, lalu coba masuk lagi.',
  weak_password: 'Kata sandi terlalu lemah. Minimal 8 karakter, memuat huruf dan angka.',
  same_password: 'Kata sandi baru harus berbeda dari yang sekarang.',
  rate_limited: 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.',
  provider_disabled:
    'Masuk dengan Google belum diaktifkan di server ini. Hubungi pengelola StudentFo.',
  invalid_link: 'Tautan ini sudah tidak berlaku atau pernah dipakai. Minta tautan baru di bawah.',
  session_missing: 'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.',
  validation: 'Ada isian yang belum benar. Periksa lagi lalu kirim ulang.',
  unavailable:
    'Fitur akun belum aktif di server ini karena belum terhubung ke database (mode data contoh).',
  unknown: 'Terjadi kesalahan di sisi kami. Coba lagi sebentar lagi.',
};

export const AUTH_NOTICE_CODES = [
  'check_email',
  'reset_email_sent',
  'password_updated',
  'email_confirmed',
  'profile_saved',
] as const;

export type AuthNoticeCode = (typeof AUTH_NOTICE_CODES)[number];

export const AUTH_NOTICE_MESSAGE: Record<AuthNoticeCode, string> = {
  // Kalimat ini SENGAJA berlaku untuk dua keadaan sekaligus: email baru dan
  // email yang ternyata sudah terdaftar. Membedakannya sama saja dengan
  // menyediakan alat pemeriksa "akun ini ada atau tidak" bagi siapa pun.
  check_email:
    'Kalau alamat itu belum terdaftar, tautan konfirmasi sudah dikirim ke sana. Cek kotak masuk dan folder spam, lalu masuk setelah email dikonfirmasi.',
  reset_email_sent:
    'Kalau alamat itu terdaftar, tautan penyetelan ulang sudah dikirim. Cek kotak masuk dan folder spam.',
  password_updated: 'Kata sandi berhasil diperbarui. Perangkat lain sudah dikeluarkan.',
  email_confirmed: 'Email kamu terkonfirmasi. Selamat datang di StudentFo.',
  profile_saved: 'Profil tersimpan.',
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuthErrorCode(value: string | string[] | undefined): AuthErrorCode | null {
  const raw = pickFirst(value);
  return AUTH_ERROR_CODES.includes(raw as AuthErrorCode) ? (raw as AuthErrorCode) : null;
}

export function parseAuthNoticeCode(value: string | string[] | undefined): AuthNoticeCode | null {
  const raw = pickFirst(value);
  return AUTH_NOTICE_CODES.includes(raw as AuthNoticeCode) ? (raw as AuthNoticeCode) : null;
}

interface SupabaseAuthErrorShape {
  code?: string;
  status?: number;
  message?: string;
}

function readError(error: unknown): SupabaseAuthErrorShape {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as SupabaseAuthErrorShape;
  return {
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
    ...(typeof candidate.status === 'number' ? { status: candidate.status } : {}),
    ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
  };
}

/**
 * Petakan error supabase-js ke kode kita.
 *
 * `code` diperiksa lebih dulu (stabil, bagian dari kontrak API), lalu
 * `status`, dan teks pesan paling akhir — teks pesan GoTrue berubah antar
 * versi dan tidak pernah aman dijadikan satu-satunya sandaran.
 */
export function mapSupabaseAuthError(error: unknown): AuthErrorCode {
  const { code, status, message } = readError(error);

  switch (code) {
    case 'invalid_credentials':
    case 'user_not_found':
      return 'invalid_credentials';
    case 'email_not_confirmed':
      return 'email_not_confirmed';
    case 'weak_password':
      return 'weak_password';
    case 'same_password':
      return 'same_password';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited';
    case 'provider_disabled':
    case 'signup_disabled':
      return 'provider_disabled';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return 'invalid_link';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'reauthentication_needed':
      return 'session_missing';
    case 'validation_failed':
      return 'validation';
  }

  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 400) {
    const text = (message ?? '').toLowerCase();
    if (text.includes('invalid login credentials')) return 'invalid_credentials';
    if (text.includes('email not confirmed')) return 'email_not_confirmed';
  }

  return 'unknown';
}
