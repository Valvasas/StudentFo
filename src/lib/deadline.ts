/**
 * Logika deadline — Blueprint §5.1 & §5.2.
 *
 * Dua keputusan teknis yang tidak ada di blueprint tapi wajib ada:
 *
 * 1. SELISIH DIHITUNG PER HARI KALENDER DI Asia/Jakarta, bukan
 *    `(deadline - now) / 86400000`. Pembagian milidetik bikin deadline
 *    besok jam 08:00 yang dilihat hari ini jam 20:00 terbaca "H-0",
 *    padahal user masih punya satu hari penuh. Label H-n adalah janji ke
 *    user; salah satu hari di sini artinya user kehilangan kesempatan.
 *
 * 2. ADA STATE `closed` UNTUK DEADLINE YANG SUDAH LEWAT. Aturan di §5.1
 *    berhenti di `days_left <= 2 -> urgent`, sehingga event yang lewat 3
 *    bulan tetap dicat merah "urgent" — merah palsu yang melatih user
 *    untuk mengabaikan warna merah yang asli (alarm fatigue).
 */

export type DeadlineUrgency = 'safe' | 'warning' | 'urgent' | 'closed' | 'unknown';

const JAKARTA_TZ = 'Asia/Jakarta';
const MS_PER_DAY = 86_400_000;

/** Notifikasi/ring mulai dihitung dari H-30 (§5.2). */
export const DEADLINE_RING_WINDOW_DAYS = 30;

const jakartaParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Proyeksikan satu instan ke tengah malam hari kalendernya di Jakarta,
 * dinyatakan sebagai epoch UTC. Dua nilai hasil fungsi ini bisa dikurangi
 * langsung untuk mendapat selisih hari kalender yang benar.
 */
function jakartaDayStart(date: Date): number {
  const parts = jakartaParts.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number.parseInt(found.value, 10) : Number.NaN;
  };
  return Date.UTC(lookup('year'), lookup('month') - 1, lookup('day'));
}

/**
 * Nomor hari kalender WIB (hari sejak epoch). Selisih dua nilai = selisih
 * hari yang sama persis dengan `daysUntil`, tanpa memanggil Intl lagi —
 * untuk perhitungan massal yang membandingkan ribuan tanggal.
 */
export function jakartaDayNumber(date: Date): number {
  return Math.round(jakartaDayStart(date) / MS_PER_DAY);
}

/** Sisa hari kalender (WIB). 0 = jatuh tempo hari ini, negatif = lewat. */
export function daysUntil(deadlineIso: string, now: Date = new Date()): number | null {
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) return null;
  return Math.round((jakartaDayStart(deadline) - jakartaDayStart(now)) / MS_PER_DAY);
}

/** Pemetaan sisa hari -> tingkat urgensi (§5.1, plus state `closed`). */
export function urgencyFromDays(daysLeft: number | null): DeadlineUrgency {
  if (daysLeft === null) return 'unknown';
  if (daysLeft < 0) return 'closed';
  if (daysLeft > 7) return 'safe';
  if (daysLeft > 2) return 'warning';
  return 'urgent';
}

export interface DeadlineState {
  readonly daysLeft: number | null;
  readonly urgency: DeadlineUrgency;
  /** Label pendek untuk badge: "H-5", "Hari ini", "Ditutup". */
  readonly shortLabel: string;
  /** Kalimat lengkap untuk screen reader & tooltip. */
  readonly longLabel: string;
  /** 0..1 — seberapa penuh cincin progres (§5.2). */
  readonly ringProgress: number;
}

/**
 * Hitung ulang setiap render (§5.1: "bukan cache statis"). Fungsi ini murni
 * dan menerima `now` sebagai parameter supaya bisa diuji deterministik dan
 * supaya server render & client render bisa disamakan saat hidrasi.
 */
export function getDeadlineState(
  deadlineIso: string | null,
  now: Date = new Date(),
): DeadlineState {
  if (!deadlineIso) {
    return {
      daysLeft: null,
      urgency: 'unknown',
      shortLabel: 'Tanggal TBA',
      longLabel: 'Tenggat belum diumumkan penyelenggara',
      ringProgress: 0,
    };
  }

  const daysLeft = daysUntil(deadlineIso, now);
  const urgency = urgencyFromDays(daysLeft);

  if (daysLeft === null) {
    return {
      daysLeft: null,
      urgency: 'unknown',
      shortLabel: 'Tanggal TBA',
      longLabel: 'Tenggat belum diumumkan penyelenggara',
      ringProgress: 0,
    };
  }

  const shortLabel =
    daysLeft < 0 ? 'Ditutup' : daysLeft === 0 ? 'Hari ini' : daysLeft === 1 ? 'Besok' : `H-${daysLeft}`;

  const longLabel =
    daysLeft < 0
      ? `Pendaftaran sudah ditutup ${Math.abs(daysLeft)} hari lalu`
      : daysLeft === 0
        ? 'Tenggat hari ini'
        : `Tersisa ${daysLeft} hari lagi`;

  // Cincin diisi berdasarkan waktu yang SUDAH berlalu dalam jendela H-30,
  // bukan durasi total kompetisi — data durasi itu jarang diketahui (§5.2).
  const elapsed = DEADLINE_RING_WINDOW_DAYS - daysLeft;
  const ringProgress = Math.min(Math.max(elapsed / DEADLINE_RING_WINDOW_DAYS, 0), 1);

  return { daysLeft, urgency, shortLabel, longLabel, ringProgress };
}

const JAKARTA_OFFSET_MS = 7 * 3_600_000;

/** `YYYY-MM-DD` hari kalender WIB tempat instan ini jatuh. */
export function jakartaDateKey(date: Date): string {
  return new Date(jakartaDayStart(date)).toISOString().slice(0, 10);
}

export interface JakartaDayWindow {
  /** Instan UTC tengah malam WIB hari pertama (inklusif). */
  readonly startIso: string;
  /** Instan UTC tengah malam WIB setelah hari terakhir (eksklusif). */
  readonly endIso: string;
  readonly keys: readonly string[];
}

/**
 * `days` hari kalender WIB berturut-turut, mulai hari ini.
 *
 * Batasnya tengah malam WIB, bukan `now + 7 × 24 jam`: tenggat pukul 23:59
 * pada hari ketujuh harus ikut terhitung, dan tenggat tadi pagi (sudah
 * lewat tapi masih "hari ini") pun begitu — kolom "hari ini" menampilkan
 * seluruh hari, bukan sisa jamnya saja.
 */
export function jakartaDayWindow(now: Date, days: number): JakartaDayWindow {
  // WIB tidak punya DST, jadi offset tetap +7 jam aman dipakai di sini.
  const start = jakartaDayStart(now) - JAKARTA_OFFSET_MS;
  const keys = Array.from({ length: days }, (_, index) =>
    new Date(start + JAKARTA_OFFSET_MS + index * MS_PER_DAY).toISOString().slice(0, 10),
  );
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + days * MS_PER_DAY).toISOString(),
    keys,
  };
}

export const DEADLINE_WEEK_DAYS = 7;

/** Kelompokkan tenggat ke 7 hari kalender WIB mulai hari ini. Tenggat di luar jendela diabaikan. */
export function buildDeadlineWeek(
  deadlineIsos: readonly string[],
  now: Date = new Date(),
): { date: string; count: number }[] {
  const { keys } = jakartaDayWindow(now, DEADLINE_WEEK_DAYS);
  const counts = new Map<string, number>(keys.map((key) => [key, 0]));

  for (const iso of deadlineIsos) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const key = jakartaDateKey(date);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }

  return keys.map((key) => ({ date: key, count: counts.get(key) ?? 0 }));
}

const longDateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  hour: '2-digit',
  minute: '2-digit',
});

/** "14.30 WIB" — jam saja, untuk kejadian dalam hitungan jam ke depan. */
export function formatTimeId(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'waktu tidak valid' : `${timeFormatter.format(date)} WIB`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateId(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Tanggal tidak valid' : longDateFormatter.format(date);
}

export function formatDateTimeId(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Tanggal tidak valid' : `${dateTimeFormatter.format(date)} WIB`;
}
