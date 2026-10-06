/**
 * Bagian aturan pendaftaran (ADR-055) yang dipakai juga di KOMPONEN KLIEN:
 * batas panjang, kode tiket, nomor WhatsApp. Sengaja tanpa zod — modul ini
 * ikut terkirim ke browser untuk pratinjau langsung di formulir, sedangkan
 * validasi yang menentukan tetap di `registration.ts` (server).
 */

export const REGISTRATION_LIMITS = {
  questionsMax: 6,
  labelMax: 160,
  optionsMax: 8,
  optionMax: 80,
  shortAnswerMax: 200,
  longAnswerMax: 1000,
  introMax: 400,
  confirmationMax: 600,
  capacityMax: 10_000,
  teamSizeMax: 10,
  institutionMax: 120,
  majorMax: 100,
  decisionNoteMax: 300,
  /** Pendaftaran baru per pengguna per jam — cukup untuk orang sungguhan, mahal untuk bot. */
  perHour: 10,
  /** Baris yang dimuat studio sekaligus. Acara kampus jarang melebihi ini; CSV memakai batas yang sama. */
  listMax: 2_000,
} as const;

/**
 * Formulir di domain kita yang meminta ini = alat phishing berlencana resmi.
 * Penyelenggara yang sungguh butuh NIK/rekening (beasiswa, honor) memakai
 * formulir resminya sendiri lewat tautan luar — di sana tanggung jawab data
 * ada pada mereka, bukan pada StudentFo (UU PDP: minimisasi data).
 */
const SENSITIVE_ASK =
  /(kata\s*sandi|password|\bpin\b|\botp\b|kode\s*(verifikasi|otp|keamanan)|\bcvv\b|nomor\s*kartu|kartu\s*kredit|rekening|\bno\.?\s*rek\b|\bnik\b|\bktp\b|kartu\s*keluarga|nomor\s*induk\s*kependudukan|nama\s*ibu\s*kandung)/i;

export function asksForSensitiveData(text: string): boolean {
  return SENSITIVE_ASK.test(text);
}

/* ------------------------------------------------------------------ */
/* Kode tiket                                                          */
/* ------------------------------------------------------------------ */

/** Tanpa 0/O, 1/I/L: kode dibacakan lewat telepon & diketik ulang di meja registrasi. */
export const TICKET_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TICKET_LENGTH = 8;

export function generateTicketCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < TICKET_LENGTH; index += 1) {
    code += TICKET_ALPHABET[Math.floor(random() * TICKET_ALPHABET.length) % TICKET_ALPHABET.length];
  }
  return code;
}

/** `ABCDEFGH` → `ABCD-EFGH`; kode tak dikenal dikembalikan apa adanya. */
export function formatTicketCode(code: string): string {
  return /^[A-Z0-9]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/* ------------------------------------------------------------------ */
/* Nomor WhatsApp                                                      */
/* ------------------------------------------------------------------ */

/**
 * `0812-3456-7890`, `62 812 3456 7890`, `+62 812…` → `+6281234567890`.
 * Hanya nomor Indonesia: penyelenggara menghubungi lewat WhatsApp, dan
 * nomor yang tidak bisa dihubungi lebih buruk daripada ditolak di depan.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  const national = digits.startsWith('62') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : null;
  if (!national || !/^8\d{8,12}$/.test(national)) return null;
  return `+62${national}`;
}

/** `+6281234567890` → `0812-3456-7890` untuk dibaca manusia. */
export function displayPhone(phone: string): string {
  const national = phone.startsWith('+62') ? `0${phone.slice(3)}` : phone;
  return national.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}
