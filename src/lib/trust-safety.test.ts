import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, REPORT_SUBJECTS } from '@/types/domain';
import { isDeleteConfirmed, normalizeUserSearch, parseReportForm, REPORT_DETAILS_MAX, reportOutcomeMessage } from './trust-safety';

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

  it('daftar alasan & subjek identik dengan CHECK di migration', () => {
    expect(REPORT_SUBJECTS).toEqual(['event', 'user']);
    expect(REPORT_REASONS).toEqual(['scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other']);
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
