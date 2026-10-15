import { describe, expect, it } from 'vitest';
import type { EventRegistration, RegistrationStatus } from '@/types/domain';
import {
  groupRegistrations,
  invalidFieldFrom,
  registrationCta,
  registrationEventClosed,
  registrationSteps,
} from './registration-view';

const NOW = new Date('2026-10-15T10:00:00+07:00');

function registration(id: string, status: RegistrationStatus, feeAmount: number | null): EventRegistration {
  return {
    id,
    code: `SF-${id}`,
    event: { id: 'e1', slug: 'acara', title: 'Acara', organizer: 'Panitia', primaryDeadlineAt: null },
    userId: 'u1',
    fullName: 'Ana',
    email: 'ana@contoh.id',
    answers: {},
    status,
    feeAmount,
    proofUploadedAt: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('registrationEventClosed', () => {
  it('menutup per detik, bukan per hari kalender — cermin register_for_event()', () => {
    const event = { status: 'APPROVED' as const, primaryDeadlineAt: '2026-10-15T09:59:00+07:00' };
    expect(registrationEventClosed(event, NOW)).toBe(true);
    expect(registrationEventClosed({ ...event, primaryDeadlineAt: '2026-10-15T23:59:00+07:00' }, NOW)).toBe(false);
  });

  it('acara EXPIRED selalu tutup; tanpa tenggat tetap buka', () => {
    expect(registrationEventClosed({ status: 'EXPIRED', primaryDeadlineAt: null }, NOW)).toBe(true);
    expect(registrationEventClosed({ status: 'APPROVED', primaryDeadlineAt: null }, NOW)).toBe(false);
  });
});

describe('registrationCta', () => {
  const form = { isOpen: true, capacity: 10, activeCount: 4 };

  it('pendaftaran sendiri menang atas keadaan formulir (termasuk acara yang sudah tutup)', () => {
    expect(registrationCta({ ...form, isOpen: false }, { id: 'r1', status: 'REJECTED' }, true)).toEqual({
      kind: 'mine',
      registrationId: 'r1',
      status: 'REJECTED',
    });
  });

  it('tanpa formulir atau formulir nonaktif → null (tautan resmi luar tetap dipakai)', () => {
    expect(registrationCta(null, null, false)).toBeNull();
    expect(registrationCta({ ...form, isOpen: false }, null, false)).toBeNull();
  });

  it('terbuka dengan sisa kuota; tanpa kuota → sisa null', () => {
    expect(registrationCta(form, null, false)).toEqual({ kind: 'open', remaining: 6 });
    expect(registrationCta({ ...form, capacity: null }, null, false)).toEqual({ kind: 'open', remaining: null });
  });

  it('penuh dan tutup dibedakan', () => {
    expect(registrationCta({ ...form, activeCount: 10 }, null, false)).toEqual({ kind: 'full' });
    expect(registrationCta(form, null, true)).toEqual({ kind: 'closed' });
  });
});

describe('registrationSteps', () => {
  const states = (status: RegistrationStatus, paid: boolean) => registrationSteps(status, paid)?.map((step) => step.state);

  it('berbayar: posisi sekarang mengikuti status', () => {
    expect(states('AWAITING_PAYMENT', true)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(states('PAYMENT_REVIEW', true)).toEqual(['done', 'done', 'current', 'todo']);
    expect(states('CONFIRMED', true)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('gratis: dua langkah, langsung selesai', () => {
    expect(registrationSteps('CONFIRMED', false)?.map((step) => step.label)).toEqual(['Daftar', 'Terkonfirmasi']);
    expect(states('CONFIRMED', false)).toEqual(['done', 'done']);
  });

  it('ditolak & dibatalkan tidak punya langkah', () => {
    expect(registrationSteps('REJECTED', true)).toBeNull();
    expect(registrationSteps('CANCELLED', false)).toBeNull();
  });
});

describe('groupRegistrations', () => {
  it('mengelompokkan per status dan menjumlah hanya yang belum dibayar', () => {
    const groups = groupRegistrations([
      registration('a', 'AWAITING_PAYMENT', 75000),
      registration('b', 'AWAITING_PAYMENT', 25000),
      registration('c', 'PAYMENT_REVIEW', 50000),
      registration('d', 'CONFIRMED', null),
      registration('e', 'CANCELLED', 10000),
      registration('f', 'REJECTED', null),
    ]);
    expect(groups.awaitingPayment.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(groups.inReview.map((entry) => entry.id)).toEqual(['c']);
    expect(groups.confirmed.map((entry) => entry.id)).toEqual(['d']);
    expect(groups.history.map((entry) => entry.id)).toEqual(['e', 'f']);
    expect(groups.amountDue).toBe(100000);
  });
});

describe('invalidFieldFrom', () => {
  const fields = [{ id: 'f_wa' }, { id: 'f_kampus' }];

  it('hanya id kolom formulir ini atau persetujuan', () => {
    expect(invalidFieldFrom('f_wa', fields)).toBe('f_wa');
    expect(invalidFieldFrom('consent', fields)).toBe('consent');
    expect(invalidFieldFrom('f_lain', fields)).toBeNull();
    expect(invalidFieldFrom('"><script>', fields)).toBeNull();
    expect(invalidFieldFrom(undefined, fields)).toBeNull();
  });
});
