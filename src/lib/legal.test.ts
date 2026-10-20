import { describe, expect, it } from 'vitest';
import { privacyPolicyStatus } from './legal';

describe('privacyPolicyStatus', () => {
  it('final hanya bila email kontak DAN tanggal berlaku valid', () => {
    expect(privacyPolicyStatus({ contactEmail: 'privasi@studentfo.id', effectiveDate: '2026-11-01' })).toEqual({
      final: true,
      contactEmail: 'privasi@studentfo.id',
      effectiveDate: '2026-11-01',
    });
  });

  it('salah satu kosong atau tidak valid = tetap draf', () => {
    expect(privacyPolicyStatus({ contactEmail: undefined, effectiveDate: '2026-11-01' })).toEqual({ final: false });
    expect(privacyPolicyStatus({ contactEmail: 'privasi@studentfo.id', effectiveDate: undefined })).toEqual({ final: false });
    expect(privacyPolicyStatus({ contactEmail: 'bukan-email', effectiveDate: '2026-11-01' })).toEqual({ final: false });
    expect(privacyPolicyStatus({ contactEmail: 'privasi@studentfo.id', effectiveDate: '1 November 2026' })).toEqual({ final: false });
  });

  it('tanggal yang tidak ada di kalender ditolak, bukan digeser', () => {
    expect(privacyPolicyStatus({ contactEmail: 'privasi@studentfo.id', effectiveDate: '2026-02-31' })).toEqual({ final: false });
  });
});
