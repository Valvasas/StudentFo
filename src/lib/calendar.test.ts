import { describe, expect, it } from 'vitest';
import type { EventDetail } from '@/types/domain';
import {
  escapeIcsText,
  foldIcsLine,
  generateGoogleCalendarUrl,
  generateIcsContent,
  icsFilename,
  upcomingDeadlines,
} from './calendar';

// 3 Okt 2026, 10:00 WIB.
const NOW = new Date('2026-10-03T03:00:00Z');
const SITE = 'https://studentfo.example';

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e1',
    slug: 'lomba-esai-nasional',
    title: 'Lomba Esai Nasional; Tema "Pangan, Air & Energi"',
    organizer: 'BEM Universitas Contoh',
    eventType: 'LOMBA',
    educationLevels: ['D4_S1'],
    categorySlugs: [],
    location: 'Bandung',
    isOnline: false,
    status: 'APPROVED',
    savedCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    primaryDeadlineAt: '2026-10-10T16:59:00Z',
    primaryDeadlineLabel: 'registration',
    isFree: true,
    priceAmount: null,
    featuredUntil: null,
    verificationBadge: null,
    description: null,
    registrationLink: 'https://kampus.example/daftar',
    sourceUrl: 'https://kampus.example',
    guidebookUrl: null,
    deadlines: [
      { id: 'd-lewat', label: 'announcement', deadlineAt: '2026-09-20T16:59:00Z', isPrimary: false },
      // 23:59 WIB 10 Okt = 16:59 UTC 10 Okt.
      { id: 'd-daftar', label: 'registration', deadlineAt: '2026-10-10T16:59:00Z', isPrimary: true },
      // 00:30 WIB 1 Nov = 17:30 UTC 31 Okt → tanggal kalender WIB tetap 1 Nov.
      { id: 'd-karya', label: 'submission', deadlineAt: '2026-10-31T17:30:00Z', isPrimary: false },
    ],
    ...overrides,
  };
}

describe('generateGoogleCalendarUrl', () => {
  it('acara seharian pada tanggal kalender WIB, judul & lokasi terisi', () => {
    const detail = event();
    const url = new URL(generateGoogleCalendarUrl(detail, detail.deadlines[1]!, { siteUrl: SITE }));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20261010/20261011');
    expect(url.searchParams.get('text')).toBe('Tenggat pendaftaran · Lomba Esai Nasional; Tema "Pangan, Air & Energi"');
    expect(url.searchParams.get('location')).toBe('Bandung');
    expect(url.searchParams.get('details')).toContain('https://studentfo.example/events/lomba-esai-nasional');
    expect(url.searchParams.get('details')).toContain('WIB');
  });

  it('tenggat lewat tengah malam WIB jatuh di tanggal WIB, bukan tanggal UTC', () => {
    const detail = event();
    const url = new URL(generateGoogleCalendarUrl(detail, detail.deadlines[2]!, { siteUrl: SITE }));
    expect(url.searchParams.get('dates')).toBe('20261101/20261102');
  });

  it('kegiatan daring tidak memakai kota sebagai lokasi', () => {
    const detail = event({ isOnline: true });
    const url = new URL(generateGoogleCalendarUrl(detail, detail.deadlines[1]!, { siteUrl: SITE }));
    expect(url.searchParams.get('location')).toBe('Daring');
  });
});

describe('escapeIcsText & foldIcsLine', () => {
  it('meng-escape backslash, titik koma, koma, dan baris baru (RFC 5545 §3.3.11)', () => {
    expect(escapeIcsText('a\\b; c, d\ne')).toBe('a\\\\b\\; c\\, d\\ne');
  });

  it('melipat per 75 oktet tanpa memotong karakter multi-byte', () => {
    const line = `SUMMARY:${'é'.repeat(100)}`;
    const folded = foldIcsLine(line);
    const segments = folded.split('\r\n');
    expect(segments.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    segments.forEach((segment, index) => {
      expect(encoder.encode(segment).length).toBeLessThanOrEqual(75);
      if (index > 0) expect(segment.startsWith(' ')).toBe(true);
    });
    // Membuka lipatan (hapus CRLF+spasi) mengembalikan baris asli utuh.
    expect(folded.replaceAll('\r\n ', '')).toBe(line);
  });
});

describe('generateIcsContent', () => {
  const ics = generateIcsContent(event(), { siteUrl: SITE, now: NOW });
  const lines = ics.split('\r\n');

  it('kalender sah: CRLF di setiap baris, pembuka/penutup, metadata wajib', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replaceAll('\r\n', '')).not.toContain('\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((line) => line.startsWith('PRODID:'))).toBe(true);
  });

  it('hanya tenggat yang belum lewat; UID stabil per tenggat; DTSTAMP UTC', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(lines).toContain('UID:d-daftar@studentfo.example');
    expect(lines).not.toContain('UID:d-lewat@studentfo.example');
    expect(lines).toContain('DTSTAMP:20261003T030000Z');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261010');
    expect(lines).toContain('DTEND;VALUE=DATE:20261011');
  });

  it('teks pengguna di-escape (titik koma & koma tidak memecah properti)', () => {
    const unfolded = ics.replaceAll('\r\n ', '');
    expect(unfolded).toContain('SUMMARY:Tenggat pendaftaran · Lomba Esai Nasional\\; Tema "Pangan\\, Air & Energi"');
  });

  it('pengingat H-3 & H-1 pukul 09.00 hanya untuk tahap yang menuntut tindakan', () => {
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(4);
    expect(lines).toContain('TRIGGER:-PT15H');
    expect(lines).toContain('TRIGGER:-P2DT15H');
  });

  it('bila semua tahapan sudah lewat, tetap kalender sah berisi riwayatnya (tanpa pengingat)', () => {
    const past = generateIcsContent(event(), { siteUrl: SITE, now: new Date('2027-01-01T00:00:00Z') });
    expect(past.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(past).not.toContain('BEGIN:VALARM');
  });
});

describe('upcomingDeadlines & icsFilename', () => {
  it('tenggat hari ini (WIB) masih dihitung akan datang', () => {
    const today = event({ deadlines: [{ id: 'x', label: 'registration', deadlineAt: '2026-10-03T16:59:00Z', isPrimary: true }] });
    expect(upcomingDeadlines(today, NOW)).toHaveLength(1);
  });

  it('nama berkas hanya karakter aman (tidak bisa menyuntik header)', () => {
    expect(icsFilename({ slug: 'lomba-esai' })).toBe('lomba-esai.ics');
    expect(icsFilename({ slug: 'a"\r\nSet-Cookie: x' })).toBe('aSet-Cookiex.ics');
    expect(icsFilename({ slug: '%%%' })).toBe('kegiatan.ics');
  });
});
