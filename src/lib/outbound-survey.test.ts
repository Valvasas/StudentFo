import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTBOUND_PLANS, OUTBOUND_SOURCES, type OutboundSurveyRecord } from '@/types/domain';
import {
  OUTBOUND_LIMITS,
  parseAnsweredEvents,
  parseOutboundRange,
  parseOutboundSurvey,
  summarizeOutboundSurveys,
  withAnsweredEvent,
} from './outbound-survey';

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

describe('daftar nilai ↔ CHECK SQL (migration 20261108100002)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261108100002_outbound_surveys.sql', import.meta.url), 'utf8');
  const checkOf = (column: string) =>
    (new RegExp(`${column}[^(]*IN \\(([^)]+)\\)`).exec(sql)?.[1] ?? '').split(',').map((value) => value.trim().replace(/'/g, ''));

  it('sumber & rencana identik — beda satu nilai = INSERT gagal di produksi', () => {
    expect(checkOf('source')).toEqual([...OUTBOUND_SOURCES]);
    expect(checkOf('plan')).toEqual([...OUTBOUND_PLANS]);
  });
});

describe('parseOutboundSurvey', () => {
  const valid = { educationLevel: 'D4_S1', source: 'INSTAGRAM', plan: 'CARI_TIM', province: 'Jawa Barat', institution: '  Universitas   Uji ' };

  it('lomba: rencana wajib; isian opsional dirapikan', () => {
    const result = parseOutboundSurvey(form(valid), 'LOMBA');
    expect(result.success && result.data).toEqual({ ...valid, institution: 'Universitas Uji' });
    expect(parseOutboundSurvey(form({ ...valid, plan: '' }), 'LOMBA').success).toBe(false);
  });

  it('selain lomba: rencana tidak ditanyakan — kiriman palsu diabaikan, bukan disimpan', () => {
    const result = parseOutboundSurvey(form({ ...valid, plan: 'TIM' }), 'BEASISWA');
    expect(result.success && result.data.plan).toBeNull();
  });

  it('opsional kosong = null; provinsi di luar daftar & sumber asing ditolak', () => {
    const result = parseOutboundSurvey(form({ ...valid, province: '', institution: '' }), 'LOMBA');
    expect(result.success && [result.data.province, result.data.institution]).toEqual([null, null]);
    expect(parseOutboundSurvey(form({ ...valid, province: 'Atlantis' }), 'LOMBA').success).toBe(false);
    expect(parseOutboundSurvey(form({ ...valid, source: 'SPAM' }), 'LOMBA').success).toBe(false);
    expect(parseOutboundSurvey(form({ ...valid, institution: 'x'.repeat(121) }), 'LOMBA').success).toBe(false);
  });
});

describe('cookie "sudah menjawab"', () => {
  it('tanpa duplikat, isi aneh dibuang, berbatas', () => {
    expect(parseAnsweredEvents(undefined)).toEqual([]);
    expect(parseAnsweredEvents('a,b,a,<script>,c')).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: OUTBOUND_LIMITS.rememberedEvents + 5 }, (_, index) => `e${index}`).join(',');
    expect(parseAnsweredEvents(many)).toHaveLength(OUTBOUND_LIMITS.rememberedEvents);
  });

  it('acara baru ditaruh di belakang dan yang tertua tergeser', () => {
    expect(withAnsweredEvent('a,b', 'a')).toBe('b,a');
    const full = Array.from({ length: OUTBOUND_LIMITS.rememberedEvents }, (_, index) => `e${index}`).join(',');
    const next = parseAnsweredEvents(withAnsweredEvent(full, 'baru'));
    expect(next.at(-1)).toBe('baru');
    expect(next).not.toContain('e0');
  });
});

describe('summarizeOutboundSurveys', () => {
  const record = (overrides: Partial<OutboundSurveyRecord>): OutboundSurveyRecord => ({
    eventId: 'e1',
    eventTitle: 'Lomba A',
    eventSlug: 'lomba-a',
    signedIn: false,
    educationLevel: 'D4_S1',
    source: 'INSTAGRAM',
    plan: null,
    province: null,
    institution: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });

  it('per acara: jumlah, sumber teratas, pencari tim; diurutkan dari yang terbanyak', () => {
    const summary = summarizeOutboundSurveys([
      record({ source: 'TIKTOK', plan: 'CARI_TIM', signedIn: true }),
      record({ source: 'TIKTOK' }),
      record({ source: 'INSTAGRAM' }),
      record({ eventId: 'e2', eventTitle: 'Lomba B', source: 'GOOGLE' }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.signedIn).toBe(1);
    expect(summary.events.map((event) => [event.eventTitle, event.responses, event.topSource, event.lookingForTeam])).toEqual([
      ['Lomba A', 3, 'TIKTOK', 1],
      ['Lomba B', 1, 'GOOGLE', 0],
    ]);
    expect(summary.bySource[0]).toEqual({ key: 'TIKTOK', count: 2 });
  });

  it('k-anonim: provinsi & institusi di bawah ambang digabung, tidak disebut namanya', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => record({ institution: 'Universitas Uji', province: 'Jawa Barat' })),
      record({ institution: ' universitas  uji ' }),
      record({ institution: 'Sekolah Satu Orang', province: 'Bali' }),
    ];
    const summary = summarizeOutboundSurveys(rows);
    expect(summary.institutions).toEqual([{ key: 'UNIVERSITAS UJI', count: 6 }]);
    expect(summary.hiddenInstitutions).toBe(1);
    expect(summary.provinces).toEqual([{ key: 'Jawa Barat', count: 5 }]);
    expect(summary.hiddenProvinces).toBe(1);
  });
});

describe('parseOutboundRange', () => {
  it('hanya dari daftar tertutup, bawaan 30 hari', () => {
    expect(parseOutboundRange('7')).toBe(7);
    expect(parseOutboundRange(['90', '7'])).toBe(90);
    expect(parseOutboundRange('365')).toBe(30);
    expect(parseOutboundRange(undefined)).toBe(30);
  });
});
