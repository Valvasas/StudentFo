import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, REPORT_SUBJECTS } from '@/types/domain';
import {
  isDeleteConfirmed,
  normalizeQuestionText,
  normalizeUserSearch,
  parseReportForm,
  questionExcerpt,
  REPORT_DETAILS_MAX,
  reportOutcomeMessage,
} from './trust-safety';

const ID = '7f3a09c2-0000-4000-8000-000000000001';

describe('parseReportForm', () => {
  it('menerima laporan sah dan merapikan keterangan', () => {
    expect(parseReportForm({ subjectType: 'event', subjectId: ID, reason: 'scam', details: '  minta transfer‮  ' })).toEqual({
      subjectType: 'event',
      subjectId: ID,
      reason: 'scam',
      details: 'minta transfer',
    });
  });

  it('keterangan kosong menjadi null', () => {
    expect(parseReportForm({ subjectType: 'user', subjectId: ID, reason: 'spam', details: '   ' })?.details).toBeNull();
  });

  it('menolak subjek, alasan, id, atau keterangan di luar kontrak', () => {
    expect(parseReportForm({ subjectType: 'team', subjectId: ID, reason: 'spam', details: '' })).toBeNull();
    expect(parseReportForm({ subjectType: 'user', subjectId: ID, reason: 'benci', details: '' })).toBeNull();
    expect(parseReportForm({ subjectType: 'user', subjectId: 'bukan-uuid', reason: 'spam', details: '' })).toBeNull();
    expect(parseReportForm({ subjectType: 'user', subjectId: ID, reason: 'spam', details: 'x'.repeat(REPORT_DETAILS_MAX + 1) })).toBeNull();
  });

  it('daftar alasan & subjek identik dengan CHECK terbaru di migration', () => {
    // CHECK subjek terakhir diganti di 20261101100006 (pertanyaan, ADR-062 #7); alasan sejak 20261031100001.
    const subjects = readFileSync('supabase/migrations/20261101100006_event_questions.sql', 'utf8').match(
      /content_reports_subject_type_check CHECK \(subject_type IN \(([^)]*)\)\)/,
    );
    const reasons = readFileSync('supabase/migrations/20261031100001_trust_and_safety.sql', 'utf8').match(/reason\s+TEXT NOT NULL CHECK \(reason IN \(([^)]*)\)\)/);
    const values = (list: string | undefined) => (list ?? '').split(',').map((value) => value.trim().replace(/'/g, ''));
    expect([...REPORT_SUBJECTS]).toEqual(values(subjects?.[1]));
    expect([...REPORT_REASONS]).toEqual(values(reasons?.[1]));
  });
});

describe('normalizeUserSearch', () => {
  it('mempertahankan email dan nama', () => {
    expect(normalizeUserSearch('  Siti.Aminah+uji@kampus.ac.id ')).toBe('Siti.Aminah+uji@kampus.ac.id');
    expect(normalizeUserSearch("Nur'aini")).toBe("Nur'aini");
  });

  it('membuang karakter yang mengubah bentuk filter PostgREST', () => {
    expect(normalizeUserSearch('a,role.eq.ADMIN)')).toBe('a role.eq.ADMIN');
    expect(normalizeUserSearch('%*()')).toBe('');
  });
});

describe('isDeleteConfirmed', () => {
  it('hanya frasa persis (abai huruf besar/kecil & spasi berlebih)', () => {
    expect(isDeleteConfirmed('HAPUS AKUN')).toBe(true);
    expect(isDeleteConfirmed('  hapus   akun ')).toBe(true);
    expect(isDeleteConfirmed('HAPUS')).toBe(false);
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed(null)).toBe(false);
  });
});

describe('reportOutcomeMessage', () => {
  it('menyebut kegiatan, tapi tidak pernah nama akun yang dilaporkan', () => {
    expect(reportOutcomeMessage('RESOLVED', 'event', 'Lomba X')).toContain('kegiatan "Lomba X"');
    expect(reportOutcomeMessage('DISMISSED', 'user', null)).toContain('akun yang kamu laporkan');
    expect(reportOutcomeMessage('RESOLVED', 'event', null)).toContain('sebuah kegiatan');
  });

  it('judul dipotong 120 code point (seperti left() Postgres), emoji tidak terbelah', () => {
    const message = reportOutcomeMessage('RESOLVED', 'event', '😀'.repeat(130));
    expect(message).toContain(`"${'😀'.repeat(120)}"`);
    expect(message).not.toContain('\uFFFD');
  });
});

describe('normalizeQuestionText', () => {
  it('markup & karakter pembalik arah dibuang, baris baru (CRLF) dipertahankan tapi dipadatkan', () => {
    expect(normalizeQuestionText('  Boleh <b>tim</b>\u202E lintas\r\n\r\n\r\n\r\nkampus?  ', 10, 500)).toBe('Boleh tim lintas\n\nkampus?');
  });

  it('di luar batas (per code point) = null', () => {
    expect(normalizeQuestionText('<i></i>  pendek ', 10, 500)).toBeNull();
    expect(normalizeQuestionText('😀'.repeat(10), 10, 10)).toBe('😀'.repeat(10));
    expect(normalizeQuestionText('😀'.repeat(11), 10, 10)).toBeNull();
    expect(normalizeQuestionText(null, 1, 10)).toBeNull();
  });
});

describe('questionExcerpt', () => {
  it('satu baris, 80 code point', () => {
    expect(questionExcerpt('a\n b')).toBe('a b');
    expect(Array.from(questionExcerpt('😀'.repeat(100)))).toHaveLength(80);
  });

  it('pelapor pertanyaan dikabari tanpa mengutip pertanyaannya', () => {
    expect(reportOutcomeMessage('DISMISSED', 'question', null)).toContain('pertanyaan yang kamu laporkan');
  });
});
