import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FormField, OutboundSurveyConfig, OutboundSurveyRecord } from '@/types/domain';
import {
  DEFAULT_OUTBOUND_CONFIG,
  isSurveyEmpty,
  OUTBOUND_LIMITS,
  OUTBOUND_QUESTION_TYPES,
  parseAnsweredEvents,
  parseOutboundAnswers,
  parseOutboundConfigInput,
  parseOutboundRange,
  parseStoredOutboundConfig,
  summarizeOutboundSurveys,
  surveyQuestionCount,
  withAnsweredEvent,
} from './outbound-survey';

const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of [value].flat()) data.append(key, item);
  return data;
};

const directory = (id: string) => (id === '001002' ? 'Universitas Indonesia' : null);

describe('bawaan ↔ baris tunggal migration 20261108100002', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261108100002_outbound_surveys.sql', import.meta.url), 'utf8');

  it('pertanyaan bawaan identik dengan JSON yang di-INSERT migration', () => {
    const seeded = /VALUES \(1, '(\[[\s\S]*?\])'::jsonb\)/.exec(sql)?.[1];
    expect(seeded).toBeDefined();
    expect(JSON.parse(seeded!)).toEqual(DEFAULT_OUTBOUND_CONFIG.questions);
  });

  it('mode bawaan sama dengan DEFAULT kolom', () => {
    const defaultOf = (column: string) => new RegExp(`${column}\\s+VARCHAR\\(8\\) NOT NULL DEFAULT '([A-Z]+)'`).exec(sql)?.[1];
    expect([defaultOf('ask_education'), defaultOf('ask_region'), defaultOf('ask_institution')]).toEqual([
      DEFAULT_OUTBOUND_CONFIG.askEducation,
      DEFAULT_OUTBOUND_CONFIG.askRegion,
      DEFAULT_OUTBOUND_CONFIG.askInstitution,
    ]);
  });

  it('batas jumlah pertanyaan di CHECK = OUTBOUND_LIMITS.maxQuestions', () => {
    expect(sql).toContain(`jsonb_array_length(questions) <= ${OUTBOUND_LIMITS.maxQuestions}`);
  });
});

describe('parseOutboundConfigInput (editor admin)', () => {
  const question: FormField = { id: 'f_umur', type: 'number', label: 'Umurmu?', help: null, required: false, options: [] };
  const valid = { askEducation: 'OFF', askRegion: 'REQUIRED', askInstitution: 'OPTIONAL', fields: JSON.stringify([question]) };

  it('menerima mode & pertanyaan berjenis yang diizinkan', () => {
    const result = parseOutboundConfigInput(form(valid));
    expect(result).toEqual({ ok: true, value: { askEducation: 'OFF', askRegion: 'REQUIRED', askInstitution: 'OPTIONAL', questions: [question] } });
  });

  it('menolak email/telepon (janji tanpa identitas), mode asing, JSON rusak, dan lebih dari batas', () => {
    expect(parseOutboundConfigInput(form({ ...valid, fields: JSON.stringify([{ ...question, type: 'email' }]) })).ok).toBe(false);
    expect(parseOutboundConfigInput(form({ ...valid, fields: JSON.stringify([{ ...question, type: 'phone' }]) })).ok).toBe(false);
    expect(parseOutboundConfigInput(form({ ...valid, askRegion: 'KADANG' })).ok).toBe(false);
    expect(parseOutboundConfigInput(form({ ...valid, fields: '{rusak' })).ok).toBe(false);
    const many = Array.from({ length: OUTBOUND_LIMITS.maxQuestions + 1 }, (_, index) => ({ ...question, id: `f_q${index}` }));
    expect(parseOutboundConfigInput(form({ ...valid, fields: JSON.stringify(many) })).ok).toBe(false);
  });

  it('jenis yang diizinkan tidak memuat jenis pembawa identitas', () => {
    expect(OUTBOUND_QUESTION_TYPES).not.toContain('email');
    expect(OUTBOUND_QUESTION_TYPES).not.toContain('phone');
    expect(OUTBOUND_QUESTION_TYPES).not.toContain('long_text');
  });

  it('baris tersimpan yang rusak turun ke bawaan per kolom; pertanyaan terlarang dibuang', () => {
    const stored = parseStoredOutboundConfig({
      askEducation: 'ANEH',
      askRegion: 'OFF',
      askInstitution: 'REQUIRED',
      questions: [question, { ...question, id: 'f_mail', type: 'email' }, 'sampah'],
      updatedAt: null,
    });
    expect(stored).toMatchObject({ askEducation: DEFAULT_OUTBOUND_CONFIG.askEducation, askRegion: 'OFF', askInstitution: 'REQUIRED', questions: [question] });
  });
});

describe('parseOutboundAnswers', () => {
  const config = DEFAULT_OUTBOUND_CONFIG;
  const valid = { educationLevel: 'D4_S1', region: '32.73', institutionId: '', institution: '', q_f_sumber: 'TikTok' };

  it('jawaban sah: kode wilayah, teks bebas dirapikan, pertanyaan tambahan lewat readAnswers()', () => {
    const result = parseOutboundAnswers(form({ ...valid, institution: '  SMA   Uji  ' }), config, directory);
    expect(result).toEqual({
      ok: true,
      value: { educationLevel: 'D4_S1', regionCode: '32.73', institutionId: null, institution: 'SMA Uji', answers: { f_sumber: 'TikTok' } },
    });
  });

  it('id direktori → nama resmi dari server, bukan teks dari peramban; id asing ditolak', () => {
    const chosen = parseOutboundAnswers(form({ ...valid, institutionId: '001002', institution: 'Nama Palsu' }), config, directory);
    expect(chosen.ok && [chosen.value.institutionId, chosen.value.institution]).toEqual(['001002', 'Universitas Indonesia']);
    expect(parseOutboundAnswers(form({ ...valid, institutionId: '999999' }), config, directory)).toEqual({ ok: false, problem: 'institution' });
  });

  it('kecamatan dipotong ke kab/kota; kode yang tidak ada ditolak', () => {
    const result = parseOutboundAnswers(form({ ...valid, region: '32.73.01' }), config, directory);
    expect(result.ok && result.value.regionCode).toBe('32.73');
    expect(parseOutboundAnswers(form({ ...valid, region: '99.99' }), config, directory)).toEqual({ ok: false, problem: 'region' });
  });

  it('wajib dihormati; pertanyaan yang dimatikan tidak dibaca walau dikirim', () => {
    expect(parseOutboundAnswers(form({ ...valid, educationLevel: '' }), config, directory)).toEqual({ ok: false, problem: 'educationLevel' });
    expect(parseOutboundAnswers(form({ ...valid, q_f_sumber: '' }), config, directory)).toEqual({ ok: false, problem: 'field:f_sumber' });
    const off: OutboundSurveyConfig = { ...config, askEducation: 'OFF', askRegion: 'OFF', askInstitution: 'OFF', questions: [] };
    expect(parseOutboundAnswers(form({ ...valid, institution: 'Sekolah' }), off, directory)).toEqual({
      ok: true,
      value: { educationLevel: null, regionCode: null, institutionId: null, institution: null, answers: {} },
    });
  });

  it('teks institusi terlalu pendek/panjang ditolak', () => {
    expect(parseOutboundAnswers(form({ ...valid, institution: 'x' }), config, directory)).toEqual({ ok: false, problem: 'institution' });
    expect(parseOutboundAnswers(form({ ...valid, institution: 'x'.repeat(121) }), config, directory)).toEqual({ ok: false, problem: 'institution' });
  });
});

describe('isSurveyEmpty & surveyQuestionCount', () => {
  it('semua dimatikan = layar pendataan tidak muncul', () => {
    const off: OutboundSurveyConfig = { ...DEFAULT_OUTBOUND_CONFIG, askEducation: 'OFF', askRegion: 'OFF', askInstitution: 'OFF', questions: [] };
    expect(isSurveyEmpty(off)).toBe(true);
    expect(isSurveyEmpty(DEFAULT_OUTBOUND_CONFIG)).toBe(false);
    expect(surveyQuestionCount(DEFAULT_OUTBOUND_CONFIG)).toBe(5);
  });
});

describe('cookie "sudah menjawab"', () => {
  it('tanpa duplikat, isi aneh dibuang, berbatas', () => {
    expect(parseAnsweredEvents(undefined)).toEqual([]);
    expect(parseAnsweredEvents('a,b,a,<script>,c')).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: OUTBOUND_LIMITS.rememberedEvents + 5 }, (_, index) => `e${index}`).join(',');
    expect(parseAnsweredEvents(many)).toHaveLength(OUTBOUND_LIMITS.rememberedEvents);
  });

  it('acara yang dijawab ulang pindah ke akhir, tidak dobel', () => {
    expect(withAnsweredEvent('a,b,c', 'a')).toBe('b,c,a');
  });
});

describe('summarizeOutboundSurveys', () => {
  const base: OutboundSurveyRecord = {
    eventId: 'e1',
    eventTitle: 'Lomba Uji',
    eventSlug: 'lomba-uji',
    signedIn: false,
    skipped: false,
    educationLevel: 'SMA_SMK',
    regionCode: null,
    institutionId: null,
    institution: null,
    answers: {},
    createdAt: '2026-11-08T00:00:00.000Z',
  };
  const row = (patch: Partial<OutboundSurveyRecord>): OutboundSurveyRecord => ({ ...base, ...patch });
  const skip = (patch: Partial<OutboundSurveyRecord> = {}) =>
    row({ skipped: true, educationLevel: null, ...patch });

  it('menjawab vs melewati per postingan; persentase pertanyaan dari yang menjawab', () => {
    const summary = summarizeOutboundSurveys(
      [
        row({ signedIn: true, answers: { f_sumber: 'TikTok' } }),
        row({ answers: { f_sumber: 'TikTok', f_rencana: 'Ikut sendiri' } }),
        skip(),
        skip({ eventId: 'e2', eventTitle: 'Beasiswa Uji', eventSlug: 'beasiswa-uji' }),
      ],
      DEFAULT_OUTBOUND_CONFIG,
    );
    expect(summary).toMatchObject({ visits: 4, answered: 2, skipped: 2, signedIn: 1 });
    expect(summary.events[0]).toMatchObject({ eventId: 'e1', visits: 3, skipped: 1, signedIn: 1 });
    const source = summary.questions[0]!;
    expect(source.kind === 'choice' && source.answered).toBe(2);
    expect(source.kind === 'choice' && source.rows[0]).toEqual({ key: 'Instagram', count: 0 });
    expect(source.kind === 'choice' && source.rows.find((r) => r.key === 'TikTok')?.count).toBe(2);
    expect(summary.byLevel).toEqual([{ key: 'SMA_SMK', count: 2 }]);
  });

  it('k-anonim: wilayah & institusi di bawah ambang digabung; teks bebas disatukan tanpa beda huruf', () => {
    const many = Array.from({ length: 5 }, () => row({ regionCode: '32.73', institution: 'sman 1 uji' }));
    const summary = summarizeOutboundSurveys([...many, row({ regionCode: '31.71', institution: 'Satu Orang' })], DEFAULT_OUTBOUND_CONFIG);
    expect(summary.regencies).toEqual([{ key: 'Kota Bandung, Jawa Barat', count: 5 }]);
    expect(summary.hiddenRegencies).toBe(1);
    expect(summary.provinces).toEqual([{ key: 'Jawa Barat', count: 5 }]);
    expect(summary.institutions).toEqual([{ key: 'SMAN 1 UJI', count: 5 }]);
    expect(summary.hiddenInstitutions).toBe(1);
  });

  it('pertanyaan angka: rata-rata, median, rentang; pertanyaan yang dihapus tidak tampil', () => {
    const config: OutboundSurveyConfig = {
      ...DEFAULT_OUTBOUND_CONFIG,
      questions: [{ id: 'f_umur', type: 'number', label: 'Umur', help: null, required: false, options: [] }],
    };
    const summary = summarizeOutboundSurveys([row({ answers: { f_umur: 16, f_sumber: 'TikTok' } }), row({ answers: { f_umur: 19 } }), row({ answers: { f_umur: 17 } })], config);
    expect(summary.questions).toHaveLength(1);
    expect(summary.questions[0]).toMatchObject({ kind: 'number', answered: 3, mean: 17.3, median: 17, min: 16, max: 19 });
  });
});

describe('parseOutboundRange', () => {
  it('daftar tertutup, bawaan 30', () => {
    expect(parseOutboundRange('7')).toBe(7);
    expect(parseOutboundRange('365')).toBe(30);
    expect(parseOutboundRange(undefined)).toBe(30);
  });
});
