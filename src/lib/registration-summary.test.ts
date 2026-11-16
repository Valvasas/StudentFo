import { describe, expect, it } from 'vitest';
import type { AnswerValue, EventRegistration, FormField, RegistrationStatus } from '@/types/domain';
import { summarizeAnswers } from './registration-summary';

const field = (overrides: Partial<FormField> & Pick<FormField, 'id' | 'type'>): FormField => ({ label: overrides.id, help: null, required: false, options: [], ...overrides });

let seq = 0;
function registration(answers: Record<string, AnswerValue>, status: RegistrationStatus = 'CONFIRMED'): EventRegistration {
  seq += 1;
  const at = new Date(Date.UTC(2026, 10, 1, 0, seq)).toISOString();
  return {
    id: `r${seq}`,
    code: 'SF-00000000',
    event: { id: 'e', slug: 'e', title: 'Lomba', organizer: 'Panitia', primaryDeadlineAt: null, eventType: 'LOMBA', status: 'APPROVED' },
    userId: `u${seq}`,
    fullName: 'Ana',
    email: 'ana@example.com',
    answers,
    status,
    feeAmount: null,
    proofUploadedAt: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

describe('summarizeAnswers', () => {
  const fields = [
    field({ id: 'f_sec', type: 'section' }),
    field({ id: 'f_jml', type: 'dropdown', options: ['1', '2', '3'] }),
    field({ id: 'f_bid', type: 'multi_select', options: ['UI', 'Backend'] }),
    field({ id: 'f_skl', type: 'scale', scale: { max: 5, lowLabel: null, highLabel: null } }),
    field({ id: 'f_umr', type: 'number' }),
    field({ id: 'f_nam', type: 'short_text' }),
    field({ id: 'f_mot', type: 'long_text' }),
    field({ id: 'f_wa', type: 'phone' }),
    field({ id: 'f_ok', type: 'checkbox' }),
  ];
  const regs = [
    registration({ f_jml: '2', f_bid: ['UI', 'Backend'], f_skl: 4, f_umr: 17, f_nam: 'SMAN 1  bandung', f_mot: 'Belajar', f_wa: '0812', f_ok: true }),
    registration({ f_jml: '2', f_bid: ['UI'], f_skl: 5, f_umr: 19, f_nam: 'Rajawali', f_mot: 'Juara', f_ok: true }),
    registration({ f_jml: '9', f_skl: 2, f_umr: 18, f_nam: ' SMAN 1 Bandung ', f_ok: false }),
    // Dibatalkan: tidak dihitung sama sekali.
    registration({ f_jml: '1', f_skl: 1, f_umr: 99, f_nam: 'Batal' }, 'CANCELLED'),
  ];
  const summary = summarizeAnswers(fields, regs);

  it('judul bagian tidak punya ringkasan; pendaftar batal/ditolak tidak dihitung', () => {
    expect(summary.map((item) => item.field.id)).not.toContain('f_sec');
    expect(summary).toHaveLength(8);
  });

  it('pilihan: hitungan & porsi terhadap yang menjawab; pilihan yang sudah tidak ada = "lainnya"', () => {
    const jml = summary.find((item) => item.field.id === 'f_jml');
    expect(jml).toMatchObject({ kind: 'choice', answered: 3, other: 1 });
    if (jml?.kind !== 'choice') throw new Error('choice');
    expect(jml.options.find((option) => option.label === '2')).toMatchObject({ count: 2, share: 2 / 3 });
    const bid = summary.find((item) => item.field.id === 'f_bid');
    if (bid?.kind !== 'choice') throw new Error('choice');
    expect(bid.multiple).toBe(true);
    expect(bid.options.map((option) => option.count)).toEqual([2, 1]);
  });

  it('skala & angka: distribusi, rata-rata, median', () => {
    const skl = summary.find((item) => item.field.id === 'f_skl');
    if (skl?.kind !== 'scale') throw new Error('scale');
    expect(skl.options.map((option) => option.count)).toEqual([0, 1, 0, 1, 1]);
    expect(skl.mean).toBeCloseTo(11 / 3, 6);
    expect(summary.find((item) => item.field.id === 'f_umr')).toMatchObject({ kind: 'number', min: 17, max: 19, median: 18, mean: 18 });
  });

  it('jawaban singkat dikelompokkan tanpa beda huruf/spasi, ejaan terbaru; paragraf = contoh terbaru dulu', () => {
    expect(summary.find((item) => item.field.id === 'f_nam')).toMatchObject({
      kind: 'grouped',
      answered: 3,
      more: 0,
      groups: [
        { label: 'SMAN 1 Bandung', count: 2, share: 2 / 3 },
        { label: 'Rajawali', count: 1, share: 1 / 3 },
      ],
    });
    expect(summary.find((item) => item.field.id === 'f_mot')).toMatchObject({ kind: 'text', answered: 2, samples: ['Juara', 'Belajar'] });
  });

  it('identitas (telepon) hanya dihitung; persetujuan ya/tidak', () => {
    expect(summary.find((item) => item.field.id === 'f_wa')).toEqual(expect.objectContaining({ kind: 'count', answered: 1 }));
    expect(summary.find((item) => item.field.id === 'f_ok')).toMatchObject({ kind: 'consent', answered: 3, yes: 2 });
  });

  it('tanpa pendaftar: semua nol, tanpa NaN', () => {
    const empty = summarizeAnswers(fields, []);
    const skl = empty.find((item) => item.field.id === 'f_skl');
    if (skl?.kind !== 'scale') throw new Error('scale');
    expect(skl.mean).toBeNull();
    expect(skl.options.every((option) => option.share === 0)).toBe(true);
  });
});
