import { describe, expect, it } from 'vitest';
import {
  asksForSensitiveData,
  csvCell,
  decideTransition,
  displayPhone,
  formatTicketCode,
  generateTicketCode,
  initialStatus,
  normalizePhone,
  parseRegistrationForm,
  parseRegistrationStats,
  parseRegistrationSubmission,
  planPromotions,
  registrationGate,
  registrationInsights,
  registrationsToCsv,
  summarizeRegistrations,
  TICKET_ALPHABET,
  waitlistPositions,
} from './registration';
import type { Registration, RegistrationForm, RegistrationStatus } from '@/types/domain';

const form = (overrides: Partial<RegistrationForm> = {}): RegistrationForm => ({
  eventId: 'e1',
  status: 'OPEN',
  reviewMode: 'AUTO',
  capacity: 2,
  waitlist: true,
  teamSize: null,
  questions: [],
  intro: null,
  confirmationNote: null,
  openedAt: null,
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const registration = (id: string, status: RegistrationStatus, createdAt: string, overrides: Partial<Registration> = {}): Registration => ({
  id,
  eventId: 'e1',
  userId: `u-${id}`,
  code: 'ABCDEFGH',
  status,
  fullName: `Orang ${id}`,
  email: `${id}@contoh.id`,
  phone: '+6281234567890',
  institution: 'Universitas Contoh',
  major: null,
  educationLevel: 'D4_S1',
  answers: [],
  team: null,
  waitlistPosition: null,
  decisionNote: null,
  createdAt,
  decidedAt: null,
  ...overrides,
});

const data = (entries: Record<string, string>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.append(key, value);
  return formData;
};

describe('kode tiket', () => {
  it('8 karakter dari alfabet tanpa huruf/angka yang mirip', () => {
    const code = generateTicketCode();
    expect(code).toMatch(new RegExp(`^[${TICKET_ALPHABET}]{8}$`));
    expect(TICKET_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('acak yang mepet 1.0 tetap di dalam alfabet', () => {
    expect(generateTicketCode(() => 0.999_999_999)).toBe('Z'.repeat(8));
  });

  it('ditampilkan berpemisah', () => {
    expect(formatTicketCode('ABCD2345')).toBe('ABCD-2345');
    expect(formatTicketCode('aneh')).toBe('aneh');
  });
});

describe('normalizePhone', () => {
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['62 812 3456 7890', '+6281234567890'],
    ['+62 (812) 3456.7890', '+6281234567890'],
    ['08123456789', '+628123456789'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['', '021-555-1234', '+1 415 555 0100', '0812abc', '08123'])('menolak %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it('kembali dibaca manusia', () => {
    expect(displayPhone('+6281234567890')).toBe('0812-3456-7890');
  });
});

describe('registrationGate', () => {
  const now = new Date('2026-10-05T05:00:00Z');
  const event = { status: 'APPROVED' as const, primaryDeadlineAt: '2026-10-10T16:59:00Z' };

  it('terbuka hanya bila formulir OPEN, acara tayang, tenggat belum lewat', () => {
    expect(registrationGate(form(), event, now)).toEqual({ ok: true });
    expect(registrationGate(null, event, now)).toEqual({ ok: false, reason: 'no_form' });
    expect(registrationGate(form({ status: 'DRAFT' }), event, now)).toEqual({ ok: false, reason: 'not_open' });
    expect(registrationGate(form(), { ...event, status: 'EXPIRED' }, now)).toEqual({ ok: false, reason: 'event_unavailable' });
    expect(registrationGate(form(), { ...event, primaryDeadlineAt: '2026-10-04T16:59:00Z' }, now)).toEqual({ ok: false, reason: 'deadline_passed' });
  });

  it('hari tenggat sendiri masih terbuka (hari kalender WIB)', () => {
    expect(registrationGate(form(), { ...event, primaryDeadlineAt: '2026-10-05T16:59:00Z' }, now)).toEqual({ ok: true });
  });
});

describe('kursi & daftar tunggu', () => {
  it('status awal mengikuti mode, lalu daftar tunggu, lalu penuh', () => {
    expect(initialStatus(form(), { capacity: 2, taken: 1, waitlisted: 0 })).toBe('CONFIRMED');
    expect(initialStatus(form({ reviewMode: 'MANUAL' }), { capacity: 2, taken: 1, waitlisted: 0 })).toBe('PENDING');
    expect(initialStatus(form(), { capacity: 2, taken: 2, waitlisted: 3 })).toBe('WAITLISTED');
    expect(initialStatus(form({ waitlist: false }), { capacity: 2, taken: 2, waitlisted: 0 })).toBeNull();
    expect(initialStatus(form({ capacity: null }), { capacity: null, taken: 900, waitlisted: 0 })).toBe('CONFIRMED');
  });

  it('promosi FIFO sebanyak kursi kosong, id sebagai pemecah seri', () => {
    const list = [
      registration('a', 'CONFIRMED', '2026-10-01T01:00:00Z'),
      registration('w3', 'WAITLISTED', '2026-10-01T05:00:00Z'),
      registration('w2', 'WAITLISTED', '2026-10-01T03:00:00Z'),
      registration('w1b', 'WAITLISTED', '2026-10-01T02:00:00Z'),
      registration('w1a', 'WAITLISTED', '2026-10-01T02:00:00Z'),
      registration('x', 'CANCELLED', '2026-10-01T00:30:00Z'),
    ];
    expect(planPromotions(form({ capacity: 3 }), list)).toEqual(['w1a', 'w1b']);
    expect(planPromotions(form({ capacity: 1 }), list)).toEqual([]);
    expect(planPromotions(form({ capacity: null }), list)).toEqual(['w1a', 'w1b', 'w2', 'w3']);
    expect([...waitlistPositions(list)]).toEqual([
      ['w1a', 1],
      ['w1b', 2],
      ['w2', 3],
      ['w3', 4],
    ]);
  });

  it('keputusan penyelenggara tunduk pada kuota', () => {
    const full = { capacity: 2, taken: 2, waitlisted: 1 };
    const open = { capacity: 2, taken: 1, waitlisted: 1 };
    expect(decideTransition('PENDING', 'CONFIRM', form(), full)).toBe('CONFIRMED');
    expect(decideTransition('WAITLISTED', 'CONFIRM', form(), full)).toBeNull();
    expect(decideTransition('WAITLISTED', 'CONFIRM', form(), open)).toBe('CONFIRMED');
    expect(decideTransition('CONFIRMED', 'REJECT', form(), full)).toBe('REJECTED');
    expect(decideTransition('CANCELLED', 'REJECT', form(), full)).toBeNull();
    expect(decideTransition('REJECTED', 'REOPEN', form({ reviewMode: 'MANUAL' }), open)).toBe('PENDING');
    expect(decideTransition('REJECTED', 'REOPEN', form(), full)).toBe('WAITLISTED');
    expect(decideTransition('REJECTED', 'REOPEN', form({ waitlist: false }), full)).toBeNull();
    expect(decideTransition('CONFIRMED', 'CONFIRM', form(), open)).toBeNull();
  });
});

describe('parseRegistrationForm', () => {
  it('slot kosong diabaikan, kuota kosong = tanpa batas, pilihan dirapikan', () => {
    const parsed = parseRegistrationForm(
      data({
        reviewMode: 'MANUAL',
        capacity: '',
        waitlist: 'on',
        q1_label: 'Ukuran kaos',
        q1_kind: 'CHOICE',
        q1_required: 'on',
        q1_options: 'S\nM\n\nM\nL',
        q3_label: 'Tautan portofolio',
        q3_kind: 'URL',
        intro: '  ',
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.capacity).toBeNull();
    expect(parsed.data.intro).toBeNull();
    expect(parsed.data.questions).toEqual([
      { id: 'q1', label: 'Ukuran kaos', kind: 'CHOICE', required: true, options: ['S', 'M', 'L'] },
      { id: 'q3', label: 'Tautan portofolio', kind: 'URL', required: false, options: [] },
    ]);
  });

  it.each(['Masukkan kata sandi akun', 'Kode OTP dari SMS', 'NIK sesuai KTP', 'Nomor rekening untuk hadiah'])('menolak pertanyaan sensitif: %s', (label) => {
    expect(parseRegistrationForm(data({ q1_label: label, q1_kind: 'SHORT' })).success).toBe(false);
  });

  it('tidak salah menuduh kata biasa', () => {
    expect(asksForSensitiveData('Spinning ide dan pinjaman alat?')).toBe(false);
    expect(asksForSensitiveData('Pinterest atau Behance')).toBe(false);
  });

  it('menolak kuota nol, tim terbalik, pilihan tunggal', () => {
    expect(parseRegistrationForm(data({ capacity: '0' })).success).toBe(false);
    expect(parseRegistrationForm(data({ teamMode: 'team', teamMin: '4', teamMax: '2' })).success).toBe(false);
    expect(parseRegistrationForm(data({ q1_label: 'Pilih satu', q1_kind: 'CHOICE', q1_options: 'Ya' })).success).toBe(false);
  });
});

describe('parseRegistrationSubmission', () => {
  const questions = [
    { id: 'q1', label: 'Ukuran kaos', kind: 'CHOICE' as const, required: true, options: ['S', 'M'] },
    { id: 'q2', label: 'Portofolio', kind: 'URL' as const, required: false, options: [] },
  ];
  const valid = { phone: '0812 3456 7890', institution: 'Universitas  Contoh', educationLevel: 'D4_S1', q1: 'M', consent: 'on' };

  it('isian sah dinormalisasi; jawaban opsional kosong tidak disimpan', () => {
    const parsed = parseRegistrationSubmission(data(valid), { questions, teamSize: null });
    expect(parsed).toEqual({
      success: true,
      data: {
        phone: '+6281234567890',
        institution: 'Universitas Contoh',
        major: null,
        educationLevel: 'D4_S1',
        answers: [{ questionId: 'q1', label: 'Ukuran kaos', value: 'M' }],
        teamId: null,
      },
    });
  });

  it('melaporkan kolom yang salah, bukan kalimat', () => {
    const parsed = parseRegistrationSubmission(data({ ...valid, phone: '12', q1: 'XL', q2: 'http://tidak-aman', consent: '' }), { questions, teamSize: null });
    expect(parsed).toEqual({ success: false, fields: ['phone', 'q1', 'q2', 'consent'] });
  });

  it('mode tim mewajibkan tim', () => {
    expect(parseRegistrationSubmission(data(valid), { questions, teamSize: { min: 2, max: 4 } })).toEqual({ success: false, fields: ['teamId'] });
  });
});

describe('CSV', () => {
  it('mematikan rumus dan menggandakan tanda kutip', () => {
    expect(csvCell('=HYPERLINK("http://jahat")')).toBe('"\'=HYPERLINK(""http://jahat"")"');
    expect(csvCell('-2+3')).toBe('"\'-2+3"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('Budi "Bud" Santoso')).toBe('"Budi ""Bud"" Santoso"');
    expect(csvCell(null)).toBe('""');
  });

  it('BOM + kolom pertanyaan mengikuti formulir', () => {
    const csv = registrationsToCsv(form({ questions: [{ id: 'q1', label: 'Kaos', kind: 'SHORT', required: false, options: [] }] }), [
      registration('a', 'CONFIRMED', '2026-10-01T01:00:00Z', { answers: [{ questionId: 'q1', label: 'Kaos', value: 'M' }] }),
    ]);
    expect(csv.startsWith('﻿"Kode","Status"')).toBe(true);
    expect(csv).toContain('"Kaos"');
    expect(csv).toContain('"ABCD-EFGH","Terdaftar","Orang a"');
    expect(csv).toContain('"0812-3456-7890"');
  });
});

describe('summarizeRegistrations & saran', () => {
  const now = new Date('2026-10-05T05:00:00Z');
  const list = [
    registration('a', 'CONFIRMED', '2026-10-04T02:00:00Z', { decidedAt: '2026-10-04T06:00:00Z' }),
    registration('b', 'PENDING', '2026-10-05T02:00:00Z', { institution: 'ITB' }),
    registration('c', 'CANCELLED', '2026-10-03T02:00:00Z', { decidedAt: '2026-10-04T02:00:00Z' }),
    registration('d', 'WAITLISTED', '2026-10-05T03:00:00Z', { educationLevel: 'D3' }),
  ];

  it('hitungan per status, deret harian WIB, asal pendaftar aktif saja', () => {
    const stats = summarizeRegistrations({ registrations: list, capacity: 2, visitors: 40, days: 7, now });
    expect(stats.series).toHaveLength(7);
    expect(stats.series.at(-1)).toEqual({ day: '2026-10-05', submitted: 2, cancelled: 0 });
    expect(stats.series.find((day) => day.day === '2026-10-04')).toEqual({ day: '2026-10-04', submitted: 1, cancelled: 1 });
    expect(stats.byStatus).toMatchObject({ CONFIRMED: 1, PENDING: 1, CANCELLED: 1, WAITLISTED: 1, REJECTED: 0 });
    expect(stats.institutions).toEqual([
      { label: 'Universitas Contoh', count: 2 },
      { label: 'ITB', count: 1 },
    ]);
    expect(stats.medianDecisionHours).toBe(4);
  });

  it('saran kuota & konversi muncul dari angka yang sama', () => {
    const stats = summarizeRegistrations({ registrations: list, capacity: 2, visitors: 40, days: 7, now });
    const texts = registrationInsights(stats, form()).map((insight) => insight.text);
    expect(texts[0]).toMatch(/Kursi terisi 100%/);
    expect(texts.some((text) => /pengunjung/.test(text))).toBe(true);
    const quiet = summarizeRegistrations({ registrations: [], capacity: null, visitors: 3, days: 7, now });
    expect(registrationInsights(quiet, form())).toEqual([]);
  });
});

describe('parseRegistrationStats (JSON RPC)', () => {
  const raw = {
    days: 14,
    series: [{ day: '2026-10-05', submitted: 3, cancelled: 1 }],
    byStatus: { PENDING: 1, CONFIRMED: 2, WAITLISTED: 0, REJECTED: 0, CANCELLED: 1 },
    capacity: null,
    visitors: 120,
    levels: [{ label: 'D4_S1', count: 2 }, { label: 'S2', count: 1 }],
    institutions: [{ label: 'ITB', count: 3 }],
    medianDecisionHours: 5.5,
  };

  it('kode jenjang dari SQL → label yang sama dengan mode seed', () => {
    expect(parseRegistrationStats(raw)?.levels).toEqual([
      { label: 'D4/S1', count: 2 },
      { label: 'S2', count: 1 },
    ]);
  });

  it('bentuk rusak = null, bukan grafik setengah jadi', () => {
    expect(parseRegistrationStats(null)).toBeNull();
    expect(parseRegistrationStats({ ...raw, series: [{ day: 'kemarin', submitted: 1, cancelled: 0 }] })).toBeNull();
    expect(parseRegistrationStats({ ...raw, medianDecisionHours: 'x' })?.medianDecisionHours).toBeNull();
  });
});
