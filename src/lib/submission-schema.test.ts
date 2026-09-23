import { describe, expect, it } from 'vitest';
import {
  dateInputToDeadlineIso,
  fromStoredPayload,
  HONEYPOT_FIELD,
  isLikelyBot,
  parseSubmissionForm,
  toStoredPayload,
} from './submission-schema';

// 10 Jan 2026, 20:00 WIB.
const NOW = new Date('2026-01-10T13:00:00Z');

function validForm(overrides: Record<string, string | string[]> = {}): FormData {
  const values: Record<string, string | string[]> = {
    email: 'Panitia@Kampus.ac.id',
    title: '  Lomba   Esai Nasional 2026 ',
    organizer: 'BEM Universitas Contoh',
    description: '',
    eventType: 'LOMBA',
    registrationLink: 'https://kampus.ac.id/daftar',
    sourceUrl: '',
    educationLevels: ['D4_S1', 'D4_S1', 'S2'],
    categorySlugs: ['sosial'],
    location: '',
    deadlineDate: '2026-02-01',
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  return form;
}

describe('dateInputToDeadlineIso', () => {
  it('mengubah tanggal jadi 23:59 WIB di hari itu', () => {
    expect(dateInputToDeadlineIso('2026-02-01')).toBe('2026-02-01T16:59:00.000Z');
  });

  it('menolak format asing dan tanggal yang tidak ada', () => {
    expect(dateInputToDeadlineIso('01/02/2026')).toBeNull();
    expect(dateInputToDeadlineIso('2026-02-31')).toBeNull();
  });
});

describe('parseSubmissionForm', () => {
  it('menerima kiriman valid dan menormalkan isinya', () => {
    const result = parseSubmissionForm(validForm(), NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.submittedByEmail).toBe('panitia@kampus.ac.id');
    expect(result.data.title).toBe('Lomba Esai Nasional 2026');
    expect(result.data.description).toBeNull();
    expect(result.data.sourceUrl).toBeNull();
    expect(result.data.educationLevels).toEqual(['D4_S1', 'S2']);
    expect(result.data.deadlineAt).toBe('2026-02-01T16:59:00.000Z');
  });

  it('menolak tautan non-http — cegah javascript: masuk ke katalog', () => {
    const result = parseSubmissionForm(validForm({ registrationLink: 'javascript:alert(1)' }), NOW);
    expect(result.success).toBe(false);
  });

  it('menolak tenggat yang sudah lewat, tapi menerima tenggat hari ini', () => {
    expect(parseSubmissionForm(validForm({ deadlineDate: '2026-01-09' }), NOW).success).toBe(false);
    expect(parseSubmissionForm(validForm({ deadlineDate: '2026-01-10' }), NOW).success).toBe(true);
  });

  it('menolak tahun yang kemungkinan salah ketik', () => {
    expect(parseSubmissionForm(validForm({ deadlineDate: '2062-01-10' }), NOW).success).toBe(false);
  });

  it('mewajibkan minimal satu jenjang dan jenis kegiatan yang dikenal', () => {
    expect(parseSubmissionForm(validForm({ educationLevels: [] }), NOW).success).toBe(false);
    expect(parseSubmissionForm(validForm({ eventType: 'KONSER' }), NOW).success).toBe(false);
  });
});

describe('honeypot', () => {
  it('menandai form yang kolom tersembunyinya terisi', () => {
    expect(isLikelyBot(validForm())).toBe(false);
    expect(isLikelyBot(validForm({ [HONEYPOT_FIELD]: 'http://spam.example' }))).toBe(true);
  });
});

describe('payload tersimpan', () => {
  it('bolak-balik toStoredPayload → fromStoredPayload tanpa kehilangan data', () => {
    const parsed = parseSubmissionForm(validForm(), NOW);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { submittedByEmail: _email, ...payload } = parsed.data;
    expect(fromStoredPayload(toStoredPayload(payload))).toEqual(payload);
  });

  it('payload yang dikirim langsung lewat API dengan bentuk asing dibaca sebagai null', () => {
    expect(fromStoredPayload({ title: 'x' })).toBeNull();
    expect(fromStoredPayload('<script>')).toBeNull();
    expect(fromStoredPayload(null)).toBeNull();
  });
});
