/**
 * Waktu pelaksanaan kegiatan (ADR-100): KAPAN acaranya berlangsung, terpisah
 * dari tenggat. Tenggat = batas tindakan (dipakai pengingat, urgensi,
 * kalender tenggat); pelaksanaan = jadwal acara (workshop, seminar,
 * konferensi). Mencampur keduanya di `event_deadlines` akan membuat pengingat
 * "tutup 3 hari lagi" berbunyi untuk hari acara.
 *
 * Isian = `<input type="datetime-local">` dalam WIB. Nilainya tidak membawa
 * zona, jadi ditafsirkan +07:00 secara eksplisit — bukan zona server.
 */
export const WIB_OFFSET = '+07:00';
const JAKARTA_TZ = 'Asia/Jakarta';
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;
/** Kegiatan yang baru lewat boleh dirapikan jadwalnya; lebih jauh = salah ketik tahun. */
const PAST_WINDOW_DAYS = 400;
/** Sama dengan batas tahapan di formulir kiriman (`submission-schema.ts`). */
const FUTURE_WINDOW_DAYS = 3 * 366;

/** "2026-12-12T09:00" (WIB) → ISO UTC; format/tanggal tidak ada di kalender = null. */
export function parseWibDateTime(value: string): string | null {
  const match = LOCAL_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(`${value.trim()}:00${WIB_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // `Date` menggulirkan 31 Feb ke Maret diam-diam; tanggal yang bergeser = tidak ada.
  const wib = new Date(date.getTime() + 7 * 3_600_000);
  if (wib.getUTCFullYear() !== year || wib.getUTCMonth() + 1 !== month || wib.getUTCDate() !== day) return null;
  return date.toISOString();
}

/** ISO → nilai `datetime-local` dalam WIB, untuk mengisi ulang formulir. */
export function toWibDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}

export type ScheduleParseResult =
  | { readonly ok: true; readonly startsAt: string | null; readonly endsAt: string | null }
  | { readonly ok: false };

/**
 * Dua isian kosong = hapus jadwal. Selesai tanpa mulai, selesai sebelum
 * mulai, atau tanggal di luar jendela wajar = ditolak (cermin CHECK
 * `events_schedule_order` + RPC `set_event_schedule`).
 */
export function parseSchedule(start: string, end: string, now: Date = new Date()): ScheduleParseResult {
  if (!start.trim() && !end.trim()) return { ok: true, startsAt: null, endsAt: null };
  const startsAt = parseWibDateTime(start);
  if (!startsAt) return { ok: false };
  const endsAt = end.trim() ? parseWibDateTime(end) : null;
  if (end.trim() && !endsAt) return { ok: false };
  const startMs = new Date(startsAt).getTime();
  if (endsAt && new Date(endsAt).getTime() < startMs) return { ok: false };
  if (startMs < now.getTime() - PAST_WINDOW_DAYS * MS_PER_DAY || startMs > now.getTime() + FUTURE_WINDOW_DAYS * MS_PER_DAY) return { ok: false };
  return { ok: true, startsAt, endsAt };
}

const dayFormatter = new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDayFormatter = new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA_TZ, day: 'numeric', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const time = (date: Date) => timeFormatter.format(date).replace(':', '.');

/**
 * "Sabtu, 12 Desember 2026 · 09.00–16.00 WIB" (satu hari) atau
 * "12 Des 2026, 09.00 – 14 Des 2026, 17.00 WIB" (beberapa hari).
 */
export function formatSchedule(startsAt: string, endsAt: string | null | undefined): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (!end) return `${dayFormatter.format(start)} · ${time(start)} WIB`;
  if (dayKeyFormatter.format(start) === dayKeyFormatter.format(end)) {
    return `${dayFormatter.format(start)} · ${time(start)}–${time(end)} WIB`;
  }
  return `${shortDayFormatter.format(start)}, ${time(start)} – ${shortDayFormatter.format(end)}, ${time(end)} WIB`;
}
