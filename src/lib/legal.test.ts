import { describe, expect, it } from 'vitest';
import { DEFAULT_OPERATOR_NAME, LEGAL_REVISION, legalConsentRecord, legalDocumentStatus, upcomingLegalChanges } from './legal';

const complete = { operatorName: 'PT Contoh Edukasi', contactEmail: 'privasi@studentfo.id', effectiveDate: '2026-11-01' };

describe('legalDocumentStatus', () => {
  it('final hanya bila nama pengelola, email kontak, DAN tanggal berlaku valid', () => {
    expect(legalDocumentStatus(complete)).toEqual({
      final: true,
      operatorName: 'PT Contoh Edukasi',
      contactEmail: 'privasi@studentfo.id',
      effectiveDate: '2026-11-01',
    });
  });

  it('salah satu kosong atau tidak valid = tetap draf', () => {
    expect(legalDocumentStatus({ ...complete, contactEmail: undefined }).final).toBe(false);
    expect(legalDocumentStatus({ ...complete, effectiveDate: undefined }).final).toBe(false);
    expect(legalDocumentStatus({ ...complete, operatorName: undefined }).final).toBe(false);
    expect(legalDocumentStatus({ ...complete, contactEmail: 'bukan-email' }).final).toBe(false);
    expect(legalDocumentStatus({ ...complete, effectiveDate: '1 November 2026' }).final).toBe(false);
    expect(legalDocumentStatus({ ...complete, operatorName: ' ' }).final).toBe(false);
  });

  it('tanggal yang tidak ada di kalender ditolak, bukan digeser', () => {
    expect(legalDocumentStatus({ ...complete, effectiveDate: '2026-02-31' }).final).toBe(false);
  });

  it('draf tetap menyebut pengelola: isian pemilik bila ada, nama generik bila belum', () => {
    expect(legalDocumentStatus({ ...complete, contactEmail: undefined }).operatorName).toBe('PT Contoh Edukasi');
    expect(legalDocumentStatus({ operatorName: undefined, contactEmail: undefined, effectiveDate: undefined }).operatorName).toBe(
      DEFAULT_OPERATOR_NAME,
    );
  });
});

describe('legalConsentRecord', () => {
  it('mencatat revisi teks yang dibaca, waktu, konfirmasi usia, dan jalurnya', () => {
    const at = new Date('2026-10-30T03:00:00Z');
    expect(legalConsentRecord('google', at)).toEqual({ revision: LEGAL_REVISION, at: '2026-10-30T03:00:00.000Z', age_confirmed: true, via: 'google' });
  });
});

describe('upcomingLegalChanges', () => {
  const draft = legalDocumentStatus({ operatorName: undefined, contactEmail: undefined, effectiveDate: undefined });
  const future = legalDocumentStatus({ ...complete, effectiveDate: '2026-11-15' });
  const today = legalDocumentStatus({ ...complete, effectiveDate: '2026-10-31' });

  it('hanya dokumen final yang berlaku di masa depan yang diumumkan', () => {
    expect(
      upcomingLegalChanges(
        [
          { label: 'Syarat & Ketentuan', href: '/terms', status: future },
          { label: 'Kebijakan privasi', href: '/privacy-policy', status: today },
          { label: 'Draf', href: '/x', status: draft },
        ],
        '2026-10-31',
      ),
    ).toEqual([{ label: 'Syarat & Ketentuan', href: '/terms', effectiveDate: '2026-11-15' }]);
  });
});
