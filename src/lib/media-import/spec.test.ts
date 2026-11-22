import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultMediaImports, normalizeMediaImports, summarizeMediaImports } from './jobs';
import { buildSlideContent, defaultCaption, MEDIA_TEMPLATES, mediaSpecSchema, toRenderableText } from './spec';

const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261121100001_event_media_imports.sql'), 'utf8');

const event = {
  title: 'Olimpiade Sains Uji 2027',
  organizer: 'Himpunan Uji',
  eventType: 'LOMBA' as const,
  educationLevels: ['SMA_SMK' as const],
  categorySlugs: ['sains'],
  location: 'Bandung',
  isOnline: false,
  registrationLink: 'https://www.uji.example/daftar',
  deadlines: [
    { id: 'b', label: 'submission' as const, deadlineAt: '2027-02-01T16:59:00Z', isPrimary: false },
    { id: 'a', label: 'registration' as const, deadlineAt: '2027-01-10T16:59:00Z', isPrimary: true },
  ],
  primaryDeadlineAt: '2027-01-10T16:59:00Z',
  primaryDeadlineLabel: 'registration' as const,
};
const names = { sains: 'Sains & Riset' };

describe('paritas dengan migration 20261121100001', () => {
  it('daftar templat sama dengan stage_event_media()', () => {
    const sqlList = /v_spec ->> 'template' IN \(([^)]+)\)/.exec(MIGRATION)?.[1];
    expect(sqlList?.split(',').map((item) => item.trim().replace(/'/g, ''))).toEqual([...MEDIA_TEMPLATES]);
  });

  it('daftar bawaan sama urutannya dengan versi SQL', () => {
    const sqlDefaults = [...MIGRATION.matchAll(/'template', '([a-z-]+)'/g)].map((match) => match[1]);
    const tsDefaults = defaultMediaImports('https://sumber.example/').flatMap((item) => {
      const spec = (item as { spec?: { template: string } }).spec;
      return spec ? [spec.template] : [];
    });
    expect(tsDefaults).toEqual(sqlDefaults);
  });
});

describe('normalizeMediaImports (cermin stage_event_media)', () => {
  it('bukan array = daftar bawaan: laman sumber jadi calon poster pertama', () => {
    const items = normalizeMediaImports(null, 'https://sumber.example/a', 0);
    expect(items.map((item) => item.kind)).toEqual(['URL', 'GENERATED', 'GENERATED', 'GENERATED', 'GENERATED']);
    expect(items.map((item) => item.isPoster)).toEqual([true, true, false, false, false]);
  });

  it('entri cacat dilewati, keterangan dirapikan, batas posisi 7 dihormati', () => {
    const media = [
      { url: 'http://tidak-aman.example/a.jpg' },
      { spec: { template: 'tak-dikenal' } },
      'bukan objek',
      { url: 'https://cdn.example/a.jpg', caption: '  Poster\tresmi ', is_poster: true },
      ...Array.from({ length: 9 }, (_, index) => ({ url: `https://cdn.example/${index}.jpg` })),
    ];
    const items = normalizeMediaImports(media, 'https://sumber.example/', 0);
    expect(items).toHaveLength(8);
    expect(items[0]).toEqual({ kind: 'URL', sourceUrl: 'https://cdn.example/a.jpg', spec: null, caption: 'Poster resmi', isPoster: true });
    expect(normalizeMediaImports(media, 'https://sumber.example/', 6)).toHaveLength(2);
  });
});

describe('buildSlideContent', () => {
  it('poster: tenggat utama WIB, fakta, domain tanpa www', () => {
    const poster = buildSlideContent(event, { template: 'poster', highlight: 'Hadiah ≥ Rp5 juta' }, names);
    expect(poster).toMatchObject({
      template: 'poster',
      typeLabel: 'Lomba',
      deadlineLabel: 'Pendaftaran ditutup',
      deadlineDate: '10 Januari 2027',
      deadlineTime: '23.59 WIB',
      highlight: 'Hadiah min. Rp5 juta',
      domain: 'uji.example',
    });
    expect(poster.template === 'poster' && poster.facts.map((fact) => fact.value)).toEqual(['Bandung', 'SMA/SMK', 'Sains & Riset']);
  });

  it('jadwal diturunkan dari tenggat (urut waktu); isi kurator menang bila ada', () => {
    const derived = buildSlideContent(event, { template: 'jadwal' }, names);
    expect(derived.template === 'jadwal' && derived.rows.map(([label]) => label)).toEqual(['Pendaftaran', 'Pengumpulan karya']);
    const curated = buildSlideContent(event, { template: 'jadwal', rows: [['Final', '23–24 Jan 2027']] }, names);
    expect(curated.template === 'jadwal' && curated.rows).toEqual([['Final', '23–24 Jan 2027']]);
  });

  it('syarat & cara daftar tanpa isi kurator tetap berguna dan tidak mengarang', () => {
    const syarat = buildSlideContent(event, { template: 'syarat' }, names);
    expect(syarat.template === 'syarat' && syarat.items).toEqual([
      'Jenjang: SMA/SMK',
      'Pelaksanaan: Bandung',
      'Bidang: Sains & Riset',
      'Syarat lengkap ada di panduan resmi penyelenggara',
    ]);
    const steps = buildSlideContent(event, { template: 'cara-daftar' }, names);
    expect(steps.template === 'cara-daftar' && steps.items.at(-1)).toBe('Daftar sebelum 10 Januari 2027');
  });

  it('keterangan bawaan ≤ 140 karakter', () => {
    const long = { ...event, title: 'Judul '.repeat(40) };
    for (const template of MEDIA_TEMPLATES) {
      expect(defaultCaption(buildSlideContent(long, { template }, names)).length).toBeLessThanOrEqual(140);
    }
  });
});

describe('mediaSpecSchema & toRenderableText', () => {
  it('menolak templat asing dan isi kepanjangan', () => {
    expect(mediaSpecSchema.safeParse({ template: 'galeri' }).success).toBe(false);
    expect(mediaSpecSchema.safeParse({ template: 'syarat', items: ['x'.repeat(91)] }).success).toBe(false);
    expect(mediaSpecSchema.safeParse({ template: 'syarat', items: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
  });
  it('simbol di luar subset font diganti kata', () => {
    expect(toRenderableText('Tim ≤ 5 orang → daftar')).toBe('Tim maks. 5 orang - daftar');
  });
});

describe('summarizeMediaImports', () => {
  it('menghitung status dan mengambil galat posisi terakhir', () => {
    expect(
      summarizeMediaImports([
        { event_id: 'e', status: 'DONE', error_code: null, position: 0 },
        { event_id: 'e', status: 'FAILED', error_code: 'not_found', position: 1 },
        { event_id: 'e', status: 'FAILED', error_code: 'too_small', position: 3 },
        { event_id: 'e', status: 'PENDING', error_code: 'fetch_failed', position: 2 },
      ]),
    ).toEqual({ pending: 1, done: 1, failed: 2, lastError: 'too_small' });
  });
});
