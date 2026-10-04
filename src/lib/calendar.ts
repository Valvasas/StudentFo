import { daysUntil, formatDateTimeId, jakartaDateKey } from '@/lib/deadline';
import { siteUrl as defaultSiteUrl } from '@/lib/env';
import { DEADLINE_LABEL_TEXT, type DeadlineLabel, type EventDeadline, type EventDetail } from '@/types/domain';

/**
 * Ekspor tenggat ke kalender pribadi (Google Calendar & berkas .ics RFC 5545).
 *
 * Setiap tenggat menjadi acara SEHARIAN pada tanggal kalender WIB-nya, bukan
 * acara berjam. Tenggat hampir selalu "23.59 WIB"; acara berjam 22.59–23.59
 * terlihat seperti rapat larut malam dan mudah terlewat di tampilan minggu,
 * sedangkan blok seharian terlihat sejak pagi. Jam persisnya ditulis di
 * deskripsi — dan pengingat (VALARM) yang membuatnya bisa ditindaklanjuti.
 */

/** Hanya tahap yang menuntut tindakan yang diberi pengingat; pengumuman tidak. */
const ACTIONABLE: readonly DeadlineLabel[] = ['registration', 'submission'];

const SUMMARY_PREFIX: Record<DeadlineLabel, string> = {
  registration: 'Tenggat pendaftaran',
  submission: 'Tenggat pengumpulan karya',
  final: 'Babak final',
  announcement: 'Pengumuman',
};

interface CalendarOptions {
  /** Origin situs untuk tautan kembali & UID. */
  readonly siteUrl?: string;
  readonly now?: Date;
}

function eventUrl(event: Pick<EventDetail, 'slug'>, siteUrl: string): string {
  return new URL(`/events/${encodeURIComponent(event.slug)}`, siteUrl).toString();
}

/** `YYYY-MM-DD` WIB → `YYYYMMDD` hari itu dan hari berikutnya (DTEND seharian bersifat eksklusif). */
function allDayRange(deadlineAt: string): { start: string; end: string } {
  const key = jakartaDateKey(new Date(deadlineAt));
  const next = new Date(`${key}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: key.replaceAll('-', ''), end: next.toISOString().slice(0, 10).replaceAll('-', '') };
}

function summaryOf(event: EventDetail, deadline: EventDeadline): string {
  return `${SUMMARY_PREFIX[deadline.label]} · ${event.title}`;
}

function descriptionOf(event: EventDetail, deadline: EventDeadline, siteUrl: string): string {
  const verb = ACTIONABLE.includes(deadline.label) ? 'Ditutup' : 'Dijadwalkan';
  return [
    `${DEADLINE_LABEL_TEXT[deadline.label]} — ${verb} ${formatDateTimeId(deadline.deadlineAt)}.`,
    `Penyelenggara: ${event.organizer}`,
    `Detail & pendaftaran: ${eventUrl(event, siteUrl)}`,
    'Jadwal bisa berubah. Selalu cocokkan dengan pengumuman resmi penyelenggara.',
  ].join('\n');
}

function locationOf(event: Pick<EventDetail, 'isOnline' | 'location'>): string {
  return event.isOnline ? 'Daring' : (event.location ?? '');
}

/**
 * Tautan "tambah ke Google Calendar" untuk satu tenggat. Tanpa OAuth dan
 * tanpa JavaScript: Google membuka formulir acara yang sudah terisi,
 * pengguna yang menekan Simpan — kita tidak pernah menulis ke kalender orang.
 */
export function generateGoogleCalendarUrl(
  event: EventDetail,
  deadline: EventDeadline,
  options: CalendarOptions = {},
): string {
  const siteUrl = options.siteUrl ?? defaultSiteUrl;
  const { start, end } = allDayRange(deadline.deadlineAt);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summaryOf(event, deadline),
    dates: `${start}/${end}`,
    details: descriptionOf(event, deadline, siteUrl),
  });
  const location = locationOf(event);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape TEXT (RFC 5545 §3.3.11). Urutan penting: backslash lebih dulu. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Lipat baris > 75 OKTET (RFC 5545 §3.1): CRLF + satu spasi. Dihitung per
 * byte UTF-8 dan tidak pernah memotong di tengah satu karakter — judul
 * berhuruf non-ASCII yang terpotong di tengah byte membuat Outlook menolak
 * seluruh berkas.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Baris lanjutan diawali spasi, jadi muatannya maksimal 74 oktet.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Tenggat yang belum lewat (hari kalender WIB) — yang layak masuk kalender. */
export function upcomingDeadlines(event: Pick<EventDetail, 'deadlines'>, now: Date = new Date()): EventDeadline[] {
  return event.deadlines.filter((deadline) => (daysUntil(deadline.deadlineAt, now) ?? -1) >= 0);
}

/**
 * Berkas .ics semua tenggat yang belum lewat (atau seluruh tahapan bila
 * semuanya sudah lewat — kalender tanpa VEVENT tidak sah menurut RFC 5545,
 * dan riwayat tahapan tetap lebih berguna daripada berkas rusak). Pemanggil
 * memastikan `event.deadlines` tidak kosong.
 *
 * Pengingat jam 09.00 sehari & tiga hari sebelumnya — selaras dengan
 * notifikasi H-3/H-1 di aplikasi (ADR-017). Pemicu relatif terhadap awal
 * acara seharian (00.00 waktu lokal), jadi -PT15H = 09.00 hari sebelumnya.
 */
export function generateIcsContent(event: EventDetail, options: CalendarOptions = {}): string {
  const siteUrl = options.siteUrl ?? defaultSiteUrl;
  const now = options.now ?? new Date();
  const host = new URL(siteUrl).hostname;
  const upcoming = upcomingDeadlines(event, now);
  const deadlines = upcoming.length > 0 ? upcoming : event.deadlines;
  const url = eventUrl(event, siteUrl);
  const location = locationOf(event);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudentFo//Kalender Tenggat//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(event.title)}`,
  ];

  for (const deadline of deadlines) {
    const { start, end } = allDayRange(deadline.deadlineAt);
    const summary = escapeIcsText(summaryOf(event, deadline));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`${deadline.id}@${host}`)}`,
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeIcsText(descriptionOf(event, deadline, siteUrl))}`,
      ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
      `URL:${url}`,
      // Blok seharian tidak boleh membuat pengguna terlihat "sibuk" sepanjang hari.
      'TRANSP:TRANSPARENT',
    );
    if (ACTIONABLE.includes(deadline.label) && (daysUntil(deadline.deadlineAt, now) ?? -1) >= 0) {
      for (const trigger of ['-P2DT15H', '-PT15H']) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, `TRIGGER:${trigger}`, 'END:VALARM');
      }
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // CRLF wajib (RFC 5545 §3.1), termasuk setelah baris terakhir.
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Nama berkas unduhan yang aman untuk header Content-Disposition. */
export function icsFilename(event: Pick<EventDetail, 'slug'>): string {
  const safe = event.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 80) || 'kegiatan';
  return `${safe}.ics`;
}
