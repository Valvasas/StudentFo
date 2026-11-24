import { EVENT_TYPE_LABEL, type EventDetail, type EventType } from '@/types/domain';

/**
 * Data terstruktur schema.org (JSON-LD) — ADR-097. Fungsi murni: halaman
 * hanya merender hasilnya lewat `<JsonLd>`.
 *
 * Aturan yang menjaga markup tetap JUJUR (Google memberi tindakan manual
 * untuk markup yang menyesatkan, dan itu lebih mahal daripada tanpa markup):
 * - `Event` HANYA bila tanggal kegiatannya diketahui: tahap setelah
 *   pendaftaran (pengumpulan karya, final, pengumuman). Tenggat pendaftaran
 *   BUKAN tanggal mulai — ia menjadi `offers.validThrough`. Data produksi
 *   (24 Nov 2026): workshop/seminar hanya punya tenggat pendaftaran, jadi
 *   tanpa `Event` sampai tanggal pelaksanaannya tercatat.
 * - Beasiswa, magang, pelatihan = `EducationalOccupationalProgram` dengan
 *   `applicationDeadline` — bentuk yang memang punya "tenggat lamaran".
 * - `description` = teks yang TERLIHAT tamu (cuplikan), bukan deskripsi
 *   penuh yang tergerbang untuk anggota (ADR-085): Google melarang markup
 *   untuk isi yang tidak tampil di halaman.
 */

export type JsonLdObject = { readonly [key: string]: unknown };

const CONTEXT = 'https://schema.org';

/** Jenis yang lebih tepat dimodelkan sebagai program dengan tenggat lamaran. */
const PROGRAM_TYPES: ReadonlySet<EventType> = new Set(['BEASISWA', 'MAGANG', 'PELATIHAN']);

/**
 * JSON aman disisipkan di `<script>`: `<` di-escape supaya judul kiriman
 * pengguna berisi `</script>` tidak menutup elemennya; pemisah baris
 * Unicode di-escape karena sah di JSON tapi bukan di semua parser JS lama.
 */
export function serializeJsonLd(data: JsonLdObject | readonly JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function absolute(siteUrl: string, path: string): string {
  return path.startsWith('http') ? path : `${siteUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function organizationJsonLd(siteUrl: string): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': absolute(siteUrl, '/#organisasi'),
    name: 'StudentFo',
    url: absolute(siteUrl, '/'),
    logo: absolute(siteUrl, '/icon/512'),
    description: 'Katalog lomba, beasiswa, magang, dan workshop untuk pelajar SMA/SMK dan mahasiswa Indonesia.',
  };
}

/** `WebSite` + `SearchAction` menunjuk ke pencarian katalog yang berfungsi tanpa JavaScript. */
export function websiteJsonLd(siteUrl: string): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': absolute(siteUrl, '/#situs'),
    name: 'StudentFo',
    url: absolute(siteUrl, '/'),
    inLanguage: 'id-ID',
    publisher: { '@id': absolute(siteUrl, '/#organisasi') },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: absolute(siteUrl, '/events?q={search_term_string}') },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqJsonLd(faqs: readonly { readonly q: string; readonly a: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}

export function breadcrumbJsonLd(siteUrl: string, items: readonly { readonly name: string; readonly path: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(siteUrl, item.path),
    })),
  };
}

export interface EventJsonLdContext {
  readonly siteUrl: string;
  /** Path/URL gambar pratinjau: poster, atau kartu OG buatan server. */
  readonly imagePath: string;
  /** Teks yang terlihat tamu di halaman (cuplikan), bukan deskripsi tergerbang. */
  readonly description: string | null;
}

/** Tanggal kegiatan = tahap setelah pendaftaran; tenggat pendaftaran tidak pernah dianggap tanggal mulai. */
export function eventDates(event: Pick<EventDetail, 'deadlines'>): { readonly start: string; readonly end: string | null } | null {
  const stages = event.deadlines
    .filter((deadline) => deadline.label !== 'registration')
    .map((deadline) => deadline.deadlineAt)
    .sort();
  const start = stages[0];
  if (!start) return null;
  const end = stages[stages.length - 1] ?? null;
  return { start, end: end && end !== start ? end : null };
}

function registrationDeadline(event: Pick<EventDetail, 'deadlines' | 'primaryDeadlineAt'>): string | null {
  return event.deadlines.find((deadline) => deadline.label === 'registration')?.deadlineAt ?? event.primaryDeadlineAt;
}

function offerOf(event: EventDetail, url: string, closed: boolean): JsonLdObject | null {
  // Biaya belum diketahui (hasil scraping) = tanpa `offers`, bukan "gratis" tebakan (ADR-049).
  if (event.isFree === null) return null;
  if (event.isFree === false && event.priceAmount === null) return null;
  const deadline = registrationDeadline(event);
  return {
    '@type': 'Offer',
    url,
    price: event.isFree ? 0 : event.priceAmount,
    priceCurrency: 'IDR',
    availability: closed ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    // Tanpa `validFrom`: kapan pendaftaran DIBUKA tidak tercatat, dan waktu tayang di StudentFo bukan jawabannya.
    ...(deadline ? { validThrough: deadline } : {}),
  };
}

function locationOf(event: EventDetail, url: string): JsonLdObject | null {
  if (event.isOnline) return { '@type': 'VirtualLocation', url };
  if (!event.location) return null;
  return {
    '@type': 'Place',
    name: event.location,
    address: { '@type': 'PostalAddress', addressLocality: event.location, addressCountry: 'ID' },
  };
}

/**
 * `Event` / `EducationalOccupationalProgram` untuk halaman detail, atau null
 * bila datanya tidak cukup untuk markup yang jujur.
 */
export function eventJsonLd(event: EventDetail, context: EventJsonLdContext, now: Date = new Date()): JsonLdObject | null {
  const url = absolute(context.siteUrl, `/events/${event.slug}`);
  const image = absolute(context.siteUrl, context.imagePath);
  const deadline = registrationDeadline(event);
  const closed = event.status === 'EXPIRED' || (deadline !== null && new Date(deadline).getTime() < now.getTime());
  const offer = offerOf(event, url, closed);
  const common = {
    '@context': CONTEXT,
    name: event.title,
    url,
    image: [image],
    inLanguage: 'id-ID',
    ...(context.description ? { description: context.description } : {}),
  };

  if (PROGRAM_TYPES.has(event.eventType)) {
    const dates = eventDates(event);
    return {
      ...common,
      '@type': 'EducationalOccupationalProgram',
      programType: EVENT_TYPE_LABEL[event.eventType],
      provider: { '@type': 'Organization', name: event.organizer },
      educationalProgramMode: event.isOnline ? 'online' : 'onsite',
      ...(deadline ? { applicationDeadline: deadline } : {}),
      ...(dates ? { startDate: dates.start } : {}),
      ...(offer ? { offers: offer } : {}),
    };
  }

  const dates = eventDates(event);
  const location = locationOf(event, url);
  if (!dates || !location) return null;
  return {
    ...common,
    '@type': 'Event',
    startDate: dates.start,
    ...(dates.end ? { endDate: dates.end } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: event.isOnline ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    organizer: { '@type': 'Organization', name: event.organizer },
    ...(offer ? { offers: offer } : {}),
  };
}
