import { describe, expect, it } from 'vitest';
import { defaultTemplateKey, internalPayment, resolveTemplate, starterInternalForm } from './admin-event';
import { FORM_TEMPLATES } from './form-templates';
import { formFieldsSchema } from './registration-form';

describe('admin-event', () => {
  it('templat bawaan mengikuti jenis kegiatan, kunci asing jatuh ke bawaan', () => {
    expect(defaultTemplateKey('LOMBA')).toBe('lomba-tim');
    expect(defaultTemplateKey('WORKSHOP')).toBe('seminar');
    expect(resolveTemplate('seminar', 'LOMBA').key).toBe('seminar');
    expect(resolveTemplate('<script>', 'LOMBA').key).toBe('lomba-tim');
    for (const template of FORM_TEMPLATES) expect(resolveTemplate(template.key, 'BEASISWA')).toBe(template);
  });

  it('berbayar wajib nominal + cara bayar ≥ 10 karakter; gratis/belum tahu tanpa biaya', () => {
    expect(internalPayment(true, 50_000, '')).toEqual({ ok: true, feeAmount: null, paymentInstructions: null });
    expect(internalPayment(null, null, '')).toEqual({ ok: true, feeAmount: null, paymentInstructions: null });
    expect(internalPayment(false, null, 'Transfer BCA 123 a.n. StudentFo')).toEqual({ ok: false });
    expect(internalPayment(false, 50_000, 'singkat')).toEqual({ ok: false });
    expect(internalPayment(false, 50_000, '  Transfer BCA 1234567 a.n. StudentFo\r\n')).toEqual({
      ok: true,
      feeAmount: 50_000,
      paymentInstructions: 'Transfer BCA 1234567 a.n. StudentFo',
    });
  });

  it('formulir awal tertutup, id baru, lolos skema kolom formulir', () => {
    const form = starterInternalForm(resolveTemplate('lomba-tim', 'LOMBA'), { feeAmount: null, paymentInstructions: null });
    expect(form.isOpen).toBe(false);
    expect(new Set(form.fields.map((field) => field.id)).size).toBe(form.fields.length);
    expect(formFieldsSchema.safeParse(form.fields).success).toBe(true);
  });
});
