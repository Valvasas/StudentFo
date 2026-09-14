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

const longDateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

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
