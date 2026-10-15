import { describe, expect, it } from 'vitest';
import type { EventRegistration, FormField } from '@/types/domain';
import {
  csvCell,
  formFieldsSchema,
  initialRegistrationStatus,
  newRegistrationCode,
  parseRegistrationFormInput,
  parseStoredFields,
  readAnswers,
  registrationAvailability,
  registrationsToCsv,
  registrationTransition,
} from './registration-form';

const field = (overrides: Partial<FormField> & Pick<FormField, 'type'>): FormField => ({
  id: `f_${overrides.type.replace(/_/g, '')}`,
  label: overrides.type,
  help: null,
  required: true,
  options: [],
  ...overrides,
});

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe('formFieldsSchema', () => {
  it('menolak id kembar dan pilihan ganda tanpa minimal dua pilihan', () => {
    const select = field({ type: 'select', options: ['A'] });
    expect(formFieldsSchema.safeParse([select]).success).toBe(false);
    const ok = field({ type: 'select', options: ['A', 'B'] });
    expect(formFieldsSchema.safeParse([ok, ok]).success).toBe(false);
    expect(formFieldsSchema.safeParse([ok]).success).toBe(true);
  });

  it('melucuti markup dari label & membuang pilihan dari jenis yang tidak memakainya', () => {
    const parsed = formFieldsSchema.parse([
      field({ type: 'short_text', label: '<b>Nama</b> tim', options: ['sisa'] }),
    ]);
    expect(parsed[0]?.label).toBe('Nama tim');
    expect(parsed[0]?.options).toEqual([]);
  });

  it('id kolom pendek dari data lama tetap diterima, id berbahaya ditolak', () => {
    expect(parseStoredFields([field({ type: 'phone', id: 'f_hp' })])).toHaveLength(1);
    expect(parseStoredFields([field({ type: 'phone', id: 'f_x"><script' })])).toHaveLength(0);
    expect(parseStoredFields([field({ type: 'phone', id: 'returnTo' })])).toHaveLength(0);
  });

  it('data tersimpan yang rusak dibuang, bukan menjatuhkan halaman', () => {
    expect(parseStoredFields([{ id: 'x', type: 'short_text' }, field({ type: 'email' })])).toHaveLength(1);
    expect(parseStoredFields('bukan array')).toEqual([]);
  });
});

describe('parseRegistrationFormInput', () => {
  const fields = JSON.stringify([field({ type: 'short_text' })]);

  it('acara berbayar wajib punya instruksi pembayaran', () => {
    expect(parseRegistrationFormInput(form({ fields, feeAmount: '50.000' }))).toEqual({
      ok: false,
      error: 'registration_form_payment',
    });
    const parsed = parseRegistrationFormInput(
      form({ fields, feeAmount: '50.000', paymentInstructions: 'BCA 1234567 a.n. Panitia', isOpen: 'on' }),
    );
    expect(parsed.ok && parsed.value).toMatchObject({ feeAmount: 50000, isOpen: true, capacity: null });
  });

  it('biaya 0 = gratis; kuota 0 atau bukan angka ditolak', () => {
    const free = parseRegistrationFormInput(form({ fields, feeAmount: '0' }));
    expect(free.ok && free.value.feeAmount).toBeNull();
    expect(parseRegistrationFormInput(form({ fields, capacity: '0' })).ok).toBe(false);
    expect(parseRegistrationFormInput(form({ fields, capacity: '1e3' })).ok).toBe(false);
  });

  it('JSON kolom rusak → kode khusus kolom', () => {
    expect(parseRegistrationFormInput(form({ fields: '{' }))).toEqual({ ok: false, error: 'registration_form_fields' });
  });
});

describe('readAnswers', () => {
  const fields: FormField[] = [
    field({ type: 'short_text', id: 'f_nama' }),
    field({ type: 'email', id: 'f_email' }),
    field({ type: 'phone', id: 'f_hp', required: false }),
    field({ type: 'select', id: 'f_ukuran', options: ['S', 'M'] }),
    field({ type: 'multi_select', id: 'f_sesi', options: ['Pagi', 'Siang'], required: false }),
    field({ type: 'checkbox', id: 'f_setuju' }),
    field({ type: 'date', id: 'f_lahir', required: false }),
  ];

  it('menerima jawaban sah dan tidak menyimpan kolom opsional kosong', () => {
    const result = readAnswers(
      fields,
      form({ q_f_nama: '  Dinda   P ', q_f_email: 'DINDA@kampus.ac.id', q_f_ukuran: 'M', q_f_sesi: ['Pagi', 'Pagi'], q_f_setuju: 'on' }),
    );
    expect(result).toEqual({
      ok: true,
      answers: { f_nama: 'Dinda P', f_email: 'dinda@kampus.ac.id', f_ukuran: 'M', f_sesi: ['Pagi'], f_setuju: true },
    });
  });

  it('pilihan di luar daftar, tanggal mustahil, dan persetujuan wajib yang kosong ditolak', () => {
    const base = { q_f_nama: 'A', q_f_email: 'a@b.co', q_f_ukuran: 'M', q_f_setuju: 'on' };
    expect(readAnswers(fields, form({ ...base, q_f_ukuran: 'XL' }))).toEqual({ ok: false, fieldId: 'f_ukuran' });
    expect(readAnswers(fields, form({ ...base, q_f_sesi: ['Malam'] }))).toEqual({ ok: false, fieldId: 'f_sesi' });
    expect(readAnswers(fields, form({ ...base, q_f_lahir: '2026-02-30' }))).toEqual({ ok: false, fieldId: 'f_lahir' });
    expect(readAnswers(fields, form({ ...base, q_f_setuju: '' }))).toEqual({ ok: false, fieldId: 'f_setuju' });
    expect(readAnswers(fields, form({ ...base, q_f_hp: '12' }))).toEqual({ ok: false, fieldId: 'f_hp' });
  });

  it('kolom URL hanya http(s)', () => {
    const url = [field({ type: 'url', id: 'f_porto' })];
    expect(readAnswers(url, form({ q_f_porto: 'javascript:alert(1)' })).ok).toBe(false);
    expect(readAnswers(url, form({ q_f_porto: 'https://contoh.id/karya' })).ok).toBe(true);
  });
});

describe('registrationTransition', () => {
  it('mengikuti alur bayar → periksa → konfirmasi', () => {
    expect(initialRegistrationStatus(50000)).toBe('AWAITING_PAYMENT');
    expect(initialRegistrationStatus(null)).toBe('CONFIRMED');
    expect(registrationTransition('AWAITING_PAYMENT', 'submit_proof')).toBe('PAYMENT_REVIEW');
    expect(registrationTransition('PAYMENT_REVIEW', 'submit_proof')).toBe('PAYMENT_REVIEW');
    expect(registrationTransition('PAYMENT_REVIEW', 'reject_payment')).toBe('AWAITING_PAYMENT');
    expect(registrationTransition('PAYMENT_REVIEW', 'confirm')).toBe('CONFIRMED');
    expect(registrationTransition('AWAITING_PAYMENT', 'confirm')).toBe('CONFIRMED');
  });

  it('status akhir tidak bisa diubah lagi', () => {
    for (const action of ['submit_proof', 'confirm', 'reject_payment', 'reject', 'cancel'] as const) {
      expect(registrationTransition('CANCELLED', action)).toBeNull();
      expect(registrationTransition('REJECTED', action)).toBeNull();
    }
    expect(registrationTransition('CONFIRMED', 'submit_proof')).toBeNull();
    expect(registrationTransition('AWAITING_PAYMENT', 'reject_payment')).toBeNull();
  });
});

describe('registrationAvailability', () => {
  it('kuota penuh, formulir tutup, dan tenggat lewat dibedakan', () => {
    expect(registrationAvailability({ isOpen: true, capacity: 2, activeCount: 2 }, false).reason).toBe('full');
    expect(registrationAvailability({ isOpen: false, capacity: null, activeCount: 0 }, false).reason).toBe('form_closed');
    expect(registrationAvailability({ isOpen: true, capacity: null, activeCount: 9 }, true).reason).toBe('event_closed');
    expect(registrationAvailability({ isOpen: true, capacity: 5, activeCount: 2 }, false)).toEqual({ open: true, reason: null, remaining: 3 });
  });
});

describe('CSV', () => {
  it('menetralkan rumus spreadsheet dan tanda kutip', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell('Biasa')).toBe('"Biasa"');
  });

  it('kolom mengikuti urutan formulir, jawaban kosong jadi sel kosong', () => {
    const fields = [field({ type: 'short_text', id: 'f_asal', label: 'Asal' }), field({ type: 'checkbox', id: 'f_ok', label: 'Setuju' })];
    const registration: EventRegistration = {
      id: 'r1',
      code: 'SF-0000ABCD',
      event: { id: 'e', slug: 'e', title: 'E', organizer: 'O', primaryDeadlineAt: null },
      userId: 'u',
      fullName: 'Dinda',
      email: 'd@x.id',
      answers: { f_ok: true },
      status: 'CONFIRMED',
      feeAmount: null,
      proofUploadedAt: null,
      reviewNote: null,
      reviewedAt: null,
      createdAt: '2026-10-14T03:00:00.000Z',
      updatedAt: '2026-10-14T03:00:00.000Z',
    };
    const csv = registrationsToCsv(fields, [registration]);
    expect(csv.startsWith('﻿"Kode","Nama"')).toBe(true);
    expect(csv).toContain('"SF-0000ABCD","Dinda","d@x.id","Terkonfirmasi","Gratis"');
    expect(csv.trimEnd().endsWith('"","Ya"')).toBe(true);
  });
});

describe('newRegistrationCode', () => {
  it('format SF- + 8 heksadesimal', () => {
    expect(newRegistrationCode()).toMatch(/^SF-[0-9A-F]{8}$/);
  });
});
