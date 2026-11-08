import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORGANIZER_TYPES } from '@/types/domain';
import {
  buildRevisionChanges,
  fromStoredRevisionChanges,
  organizerSignUpSchema,
  parseOrganizerApplication,
  parseOrganizerDraft,
  sameOrganizerIdentity,
  toOrganizerDraft,
  toStoredRevisionChanges,
} from './organizer';

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
};

const now = new Date('2026-09-28T03:00:00Z');
const event = {
  description: 'Deskripsi lama',
  registrationLink: 'https://daftar.example/lama',
  location: 'Bandung',
  isOnline: false,
  educationLevels: ['D4_S1'] as const,
  // 10 Oktober 2026 23.59 WIB
  primaryDeadlineAt: '2026-10-10T16:59:00.000Z',
};

const unchanged = (): [string, string][] => [
  ['description', 'Deskripsi lama'],
  ['registrationLink', 'https://daftar.example/lama'],
  ['location', 'Bandung'],
  ['educationLevels', 'D4_S1'],
  ['deadlineDate', '2026-10-10'],
];

describe('parseOrganizerApplication', () => {
  it('menerima pengajuan lengkap dan merapikan spasi nama lembaga', () => {
    const result = parseOrganizerApplication(
      form([
        ['orgName', '  Himpunan   Mahasiswa  '],
        ['orgType', 'ORMAWA'],
        ['contactRole', ' Ketua   Himpunan '],
        ['website', 'https://himpunan.example'],
        ['evidence', 'Saya ketua, lihat https://himpunan.example/pengurus'],
      ]),
    );
    expect(result.success && result.data).toEqual({
      orgName: 'Himpunan Mahasiswa',
      orgType: 'ORMAWA',
      contactRole: 'Ketua Himpunan',
      website: 'https://himpunan.example',
      evidence: 'Saya ketua, lihat https://himpunan.example/pengurus',
    });
  });

  const base: [string, string][] = [['orgType', 'KOMUNITAS'], ['contactRole', 'Ketua']];

  it('menolak situs non-https dan bukti yang terlalu pendek', () => {
    expect(parseOrganizerApplication(form([...base, ['orgName', 'Himpunan'], ['website', 'http://x.example'], ['evidence', 'x'.repeat(30)]])).success).toBe(false);
    expect(parseOrganizerApplication(form([...base, ['orgName', 'Himpunan'], ['website', 'javascript:alert(1)'], ['evidence', 'x'.repeat(30)]])).success).toBe(false);
    expect(parseOrganizerApplication(form([...base, ['orgName', 'Himpunan'], ['website', ''], ['evidence', 'singkat']])).success).toBe(false);
  });

  it('jenis lembaga & jabatan wajib — pengajuan tanpa keduanya (bentuk lama) ditolak', () => {
    const legacy: [string, string][] = [['orgName', 'Himpunan'], ['website', ''], ['evidence', 'x'.repeat(30)]];
    expect(parseOrganizerApplication(form(legacy)).success).toBe(false);
    expect(parseOrganizerApplication(form([...legacy, ['orgType', 'ADMIN'], ['contactRole', 'Ketua']])).success).toBe(false);
    expect(parseOrganizerApplication(form([...legacy, ['orgType', 'KAMPUS'], ['contactRole', 'K']])).success).toBe(false);
    expect(parseOrganizerApplication(form([...legacy, ...base])).success).toBe(true);
  });
});

describe('ORGANIZER_TYPES ↔ CHECK org_type (migration 20261108100001)', () => {
  it('daftar di kode identik dengan CHECK di SQL — beda satu nilai = pengajuan gagal di database', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/20261108100001_organizer_signup_fields.sql', import.meta.url), 'utf8');
    const check = /org_type IN \(([^)]+)\)/.exec(sql)?.[1] ?? '';
    expect(check.split(',').map((value) => value.trim().replace(/'/g, ''))).toEqual([...ORGANIZER_TYPES]);
  });
});

describe('draf pengajuan di metadata (ADR-069)', () => {
  const application = {
    orgName: 'Himpunan Mahasiswa',
    orgType: 'ORMAWA' as const,
    contactRole: 'Ketua Himpunan',
    website: null,
    evidence: 'Saya ketua, lihat https://himpunan.example/pengurus',
  };

  it('pulang-pergi tanpa kehilangan data; situs kosong tetap null', () => {
    expect(parseOrganizerDraft(toOrganizerDraft(application))).toEqual(application);
  });

  it('metadata ditulis pemiliknya sendiri: bentuk asing, kolom kurang, atau situs berbahaya = tidak ada draf', () => {
    expect(parseOrganizerDraft(null)).toBeNull();
    expect(parseOrganizerDraft('Himpunan')).toBeNull();
    expect(parseOrganizerDraft({ orgName: 'Himpunan' })).toBeNull();
    expect(parseOrganizerDraft({ ...toOrganizerDraft(application), website: 'javascript:alert(1)' })).toBeNull();
  });

  it('identitas sama = tidak dikirim ulang; jabatan berbeda = identitas berubah', () => {
    expect(sameOrganizerIdentity(application, application)).toBe(true);
    expect(sameOrganizerIdentity(application, { ...application, contactRole: 'Humas' })).toBe(false);
    expect(sameOrganizerIdentity({ ...application, orgType: null }, application)).toBe(false);
  });
});

describe('organizerSignUpSchema', () => {
  const valid = {
    fullName: 'Siti Aminah',
    email: 'siti@himpunan.ac.id',
    password: 'rahasia123',
    confirmPassword: 'rahasia123',
    ageConfirm: 'yes',
    privacyConsent: 'yes',
    authority: 'yes',
    orgName: 'Himpunan Mahasiswa',
    orgType: 'ORMAWA',
    contactRole: 'Ketua',
    website: '',
    evidence: 'Saya ketua, lihat https://himpunan.example/pengurus',
  };

  it('akun + data lembaga lolos bersama; situs kosong jadi null', () => {
    const result = organizerSignUpSchema.safeParse(valid);
    expect(result.success && result.data.website).toBeNull();
  });

  it('pernyataan wewenang wajib, terpisah dari usia & persetujuan', () => {
    const result = organizerSignUpSchema.safeParse({ ...valid, authority: '' });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['authority']]);
  });

  it('data lembaga ikut syarat pengajuan studio: bukti terlalu pendek ditolak', () => {
    const result = organizerSignUpSchema.safeParse({ ...valid, evidence: 'singkat' });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['evidence']]);
  });

  it('ulangan sandi wajib sama', () => {
    const result = organizerSignUpSchema.safeParse({ ...valid, confirmPassword: 'rahasia124' });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['confirmPassword']]);
  });
});

describe('buildRevisionChanges', () => {
  it('hanya membawa kolom yang benar-benar berubah', () => {
    const result = buildRevisionChanges(event, form([...unchanged().filter(([k]) => k !== 'location'), ['location', 'Jakarta'], ['note', 'Pindah tempat']]), now);
    expect(result).toEqual({ ok: true, changes: { location: 'Jakarta' }, note: 'Pindah tempat' });
  });

  it('permintaan tanpa perubahan ditolak sebelum masuk antrean', () => {
    expect(buildRevisionChanges(event, form(unchanged()), now)).toEqual({ ok: false, error: 'revision_empty' });
  });

  it('tenggat dibandingkan per hari WIB, bukan potongan tanggal UTC', () => {
    // 10 Okt 17.00 WIB: hari WIB yang sama dengan isian → bukan perubahan.
    const sameWibDay = { ...event, primaryDeadlineAt: '2026-10-10T10:00:00.000Z' };
    expect(buildRevisionChanges(sameWibDay, form(unchanged()), now)).toEqual({ ok: false, error: 'revision_empty' });
    // 11 Okt 03.00 WIB — tanggal UTC-nya "10 Okt", tapi di WIB sudah hari berikutnya.
    const nextWibDay = { ...event, primaryDeadlineAt: '2026-10-10T20:00:00.000Z' };
    expect(buildRevisionChanges(nextWibDay, form(unchanged()), now)).toEqual({
      ok: true,
      changes: { deadlineAt: '2026-10-10T16:59:00.000Z' },
      note: null,
    });
  });

  it('perpanjangan tenggat diterima; tenggat lewat/hari ini/3 tahun+ ditolak', () => {
    const extend = buildRevisionChanges(event, form([...unchanged().filter(([k]) => k !== 'deadlineDate'), ['deadlineDate', '2026-10-20']]), now);
    expect(extend).toMatchObject({ ok: true, changes: { deadlineAt: '2026-10-20T16:59:00.000Z' } });
    for (const date of ['2026-09-01', '2026-09-28', '2030-01-01', '2026-02-31']) {
      const result = buildRevisionChanges(event, form([...unchanged().filter(([k]) => k !== 'deadlineDate'), ['deadlineDate', date]]), now);
      expect(result, date).toEqual({ ok: false, error: 'revision_deadline' });
    }
  });

  it('tautan pendaftaran harus https; jenjang minimal satu', () => {
    const http = buildRevisionChanges(event, form([...unchanged().filter(([k]) => k !== 'registrationLink'), ['registrationLink', 'http://phishing.example']]), now);
    expect(http).toEqual({ ok: false, error: 'invalid_revision' });
    const noLevel = buildRevisionChanges(event, form(unchanged().filter(([k]) => k !== 'educationLevels')), now);
    expect(noLevel).toEqual({ ok: false, error: 'invalid_revision' });
  });
});

describe('penyimpanan changes (JSONB)', () => {
  it('bolak-balik utuh, termasuk null eksplisit', () => {
    const changes = { description: null, location: 'Jakarta', isOnline: true, educationLevels: ['SMA_SMK' as const], deadlineAt: '2026-10-20T16:59:00.000Z' };
    expect(fromStoredRevisionChanges(toStoredRevisionChanges(changes))).toEqual(changes);
  });

  it('kunci asing atau tautan berbahaya dari database = tidak dipercaya', () => {
    expect(fromStoredRevisionChanges({ title: 'Ganti judul' })).toBeNull();
    expect(fromStoredRevisionChanges({ registration_link: 'javascript:alert(1)' })).toBeNull();
    expect(fromStoredRevisionChanges('bukan objek')).toBeNull();
  });
});
