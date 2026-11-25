import { describe, expect, it } from 'vitest';
import type { EventDetail } from '@/types/domain';
import { breadcrumbJsonLd, eventDates, eventJsonLd, faqJsonLd, serializeJsonLd, websiteJsonLd } from './structured-data';

const SITE = 'https://studentfo.test';
const NOW = new Date('2026-11-24T05:00:00Z');

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e1',
    slug: 'lomba-esai-nasional',
    title: 'Lomba Esai Nasional',
    organizer: 'BEM Universitas Contoh',
    eventType: 'LOMBA',
    educationLevels: ['D4_S1'],
    categorySlugs: ['karya-tulis'],
    location: null,
    isOnline: true,
    status: 'APPROVED',
    savedCount: 0,
    createdAt: '2026-11-01T00:00:00Z',
    primaryDeadlineAt: '2026-12-01T16:59:00Z',
    primaryDeadlineLabel: 'registration',
    isFree: true,
    priceAmount: null,
    featuredUntil: null,
    verificationBadge: null,
    description: 'Lomba esai untuk mahasiswa.',
    registrationLink: 'https://bem.example/daftar',
    sourceUrl: 'https://bem.example/pengumuman',
    deadlines: [
      { id: 'd1', label: 'registration', deadlineAt: '2026-12-01T16:59:00Z', isPrimary: true },
      { id: 'd2', label: 'submission', deadlineAt: '2026-12-10T16:59:00Z', isPrimary: false },
      { id: 'd3', label: 'announcement', deadlineAt: '2026-12-20T03:00:00Z', isPrimary: false },
    ],
    guidebookUrl: null,
    ...overrides,
  };
}

const context = { siteUrl: SITE, imagePath: '/events/lomba-esai-nasional/opengraph-image', description: 'Lomba esai untuk mahasiswa.' };

describe('eventJsonLd — Event (syarat Rich Results Google: name, startDate, location)', () => {
  it('lomba daring bertahap: tanggal dari tahap setelah pendaftaran, tenggat daftar = validThrough', () => {
    const json = eventJsonLd(event(), context, NOW)!;
    expect(json['@type']).toBe('Event');
    expect(json.name).toBe('Lomba Esai Nasional');
    expect(json.startDate).toBe('2026-12-10T16:59:00Z');
    expect(json.endDate).toBe('2026-12-20T03:00:00Z');
    expect(json.location).toEqual({ '@type': 'VirtualLocation', url: `${SITE}/events/lomba-esai-nasional` });
    expect(json.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(json.image).toEqual([`${SITE}/events/lomba-esai-nasional/opengraph-image`]);
    expect(json.offers).toMatchObject({ price: 0, priceCurrency: 'IDR', availability: 'https://schema.org/InStock', validThrough: '2026-12-01T16:59:00Z' });
    expect(json.organizer).toEqual({ '@type': 'Organization', name: 'BEM Universitas Contoh' });
  });

  it('luring memakai Place beralamat; tanpa lokasi = tanpa markup (Google mewajibkan alamat)', () => {
    const onsite = eventJsonLd(event({ isOnline: false, location: 'Bandung' }), context, NOW)!;
    expect(onsite.location).toMatchObject({ '@type': 'Place', address: { addressLocality: 'Bandung', addressCountry: 'ID' } });
    expect(onsite.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
    expect(eventJsonLd(event({ isOnline: false, location: null }), context, NOW)).toBeNull();
  });

  it('hanya tenggat pendaftaran = tanpa Event (tenggat bukan tanggal mulai)', () => {
    const registrationOnly = event({ deadlines: [{ id: 'd1', label: 'registration', deadlineAt: '2026-12-01T16:59:00Z', isPrimary: true }] });
    expect(eventDates(registrationOnly)).toBeNull();
    expect(eventJsonLd(registrationOnly, context, NOW)).toBeNull();
    expect(eventJsonLd({ ...registrationOnly, eventType: 'WORKSHOP' }, context, NOW)).toBeNull();
  });

  it('waktu pelaksanaan (ADR-100) menjadikan workshop ber-Event, dan menang atas tanggal tahap', () => {
    const registrationOnly = event({ deadlines: [{ id: 'd1', label: 'registration', deadlineAt: '2026-12-01T16:59:00Z', isPrimary: true }] });
    const scheduled = { ...registrationOnly, eventType: 'WORKSHOP' as const, startsAt: '2026-12-12T02:00:00.000Z', endsAt: '2026-12-12T09:00:00.000Z' };
    expect(eventJsonLd(scheduled, context, NOW)).toMatchObject({ '@type': 'Event', startDate: '2026-12-12T02:00:00.000Z', endDate: '2026-12-12T09:00:00.000Z' });
    expect(eventDates({ ...event(), startsAt: '2027-01-05T03:00:00.000Z', endsAt: null })).toEqual({ start: '2027-01-05T03:00:00.000Z', end: null });
  });

  it('biaya belum diketahui = tanpa offers; ditutup = SoldOut', () => {
    expect(eventJsonLd(event({ isFree: null }), context, NOW)!.offers).toBeUndefined();
    expect(eventJsonLd(event({ isFree: false, priceAmount: 75000 }), context, NOW)!.offers).toMatchObject({ price: 75000 });
    expect(eventJsonLd(event({ status: 'EXPIRED' }), context, NOW)!.offers).toMatchObject({ availability: 'https://schema.org/SoldOut' });
  });
});

describe('eventJsonLd — EducationalOccupationalProgram', () => {
  it('beasiswa & magang: penyedia + tenggat lamaran, meski hanya ada tenggat pendaftaran', () => {
    const scholarship = event({
      eventType: 'BEASISWA',
      deadlines: [{ id: 'd1', label: 'registration', deadlineAt: '2026-12-31T16:59:00Z', isPrimary: true }],
      primaryDeadlineAt: '2026-12-31T16:59:00Z',
    });
    const json = eventJsonLd(scholarship, context, NOW)!;
    expect(json['@type']).toBe('EducationalOccupationalProgram');
    expect(json.programType).toBe('Beasiswa');
    expect(json.provider).toEqual({ '@type': 'Organization', name: 'BEM Universitas Contoh' });
    expect(json.applicationDeadline).toBe('2026-12-31T16:59:00Z');
    expect(json.educationalProgramMode).toBe('online');
    expect(json.startDate).toBeUndefined();
  });
});

describe('JSON-LD situs', () => {
  it('WebSite + SearchAction menunjuk ke pencarian katalog', () => {
    const json = websiteJsonLd(SITE);
    expect(json.potentialAction).toMatchObject({
      '@type': 'SearchAction',
      target: { urlTemplate: `${SITE}/events?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    });
  });

  it('FAQPage & BreadcrumbList berbentuk sesuai schema.org', () => {
    expect(faqJsonLd([{ q: 'Gratis?', a: 'Ya.' }]).mainEntity).toEqual([{ '@type': 'Question', name: 'Gratis?', acceptedAnswer: { '@type': 'Answer', text: 'Ya.' } }]);
    expect(breadcrumbJsonLd(SITE, [{ name: 'Beranda', path: '/' }, { name: 'Lomba', path: '/events?type=LOMBA' }]).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Lomba', item: `${SITE}/events?type=LOMBA` },
    ]);
  });
});

describe('serializeJsonLd', () => {
  it('judul berisi </script> tidak bisa menutup elemen script', () => {
    const text = serializeJsonLd({ name: '</script><script>alert(1)</script> & lain' });
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(JSON.parse(text)).toEqual({ name: '</script><script>alert(1)</script> & lain' });
  });
});
