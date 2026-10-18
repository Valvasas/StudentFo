import { describe, expect, it } from 'vitest';
import { parseRegistrationFormInput } from '@/lib/registration-form';
import { CAPACITY_PATTERN, registrationSettingsIssues } from './registration-settings';

const valid = { capacity: '', feeAmount: '', paymentInstructions: '' };
const INSTRUCTIONS = 'Transfer ke BCA 1234567890 a.n. Panitia.';

function serverAccepts(values: typeof valid): boolean {
  const formData = new FormData();
  formData.set('fields', '[]');
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return parseRegistrationFormInput(formData).ok;
}

describe('registrationSettingsIssues', () => {
  it('meloloskan kuota kosong / positif dan biaya kosong / nol tanpa instruksi', () => {
    for (const values of [valid, { ...valid, capacity: '1.000' }, { ...valid, feeAmount: '0' }, { ...valid, feeAmount: ' ' }]) {
      expect(registrationSettingsIssues(values)).toEqual({ capacity: '', feeAmount: '', paymentInstructions: '' });
    }
  });

  it('menahan kuota 0 dan di atas batas', () => {
    expect(registrationSettingsIssues({ ...valid, capacity: '0' }).capacity).not.toBe('');
    expect(registrationSettingsIssues({ ...valid, capacity: '0.000' }).capacity).not.toBe('');
    expect(registrationSettingsIssues({ ...valid, capacity: '100.001' }).capacity).not.toBe('');
    expect(registrationSettingsIssues({ ...valid, capacity: '100.000' }).capacity).toBe('');
  });

  it('acara berbayar butuh instruksi minimal 10 karakter setelah dipangkas', () => {
    expect(registrationSettingsIssues({ ...valid, feeAmount: '75.000' }).paymentInstructions).not.toBe('');
    expect(registrationSettingsIssues({ ...valid, feeAmount: '75.000', paymentInstructions: '   BCA 123   ' }).paymentInstructions).not.toBe('');
    expect(registrationSettingsIssues({ ...valid, feeAmount: '75.000', paymentInstructions: INSTRUCTIONS }).paymentInstructions).toBe('');
  });

  it('menahan biaya di atas batas tanpa menuntut instruksi dari angka yang tidak sah', () => {
    const issues = registrationSettingsIssues({ ...valid, feeAmount: '1.000.000.000' });
    expect(issues.feeAmount).not.toBe('');
    expect(issues.paymentInstructions).toBe('');
  });

  it('biaya bukan angka ("Rp 50.000", "50rb") diminta ditulis angka, bukan disebut melebihi batas', () => {
    for (const feeAmount of ['Rp 50.000', '50rb']) {
      const issues = registrationSettingsIssues({ ...valid, feeAmount });
      expect(issues.feeAmount, feeAmount).toMatch(/angka/);
      expect(issues.paymentInstructions).toBe('');
    }
  });

  it('sejalan dengan gerbang server: lolos di klien ⇔ diterima server', () => {
    const cases = [
      valid,
      { ...valid, capacity: '0' },
      { ...valid, capacity: '40' },
      { ...valid, capacity: '250000' },
      { ...valid, feeAmount: '0' },
      { ...valid, feeAmount: '75.000' },
      { ...valid, feeAmount: '75.000', paymentInstructions: 'BCA 123' },
      { ...valid, feeAmount: '75.000', paymentInstructions: INSTRUCTIONS },
      { ...valid, feeAmount: '999.999.999', paymentInstructions: INSTRUCTIONS },
      { ...valid, feeAmount: 'Rp 50.000', paymentInstructions: INSTRUCTIONS },
      { ...valid, capacity: '40 orang' },
      { ...valid, capacity: ' ' },
      { ...valid, capacity: '.' },
      { ...valid, capacity: '1.000' },
      { ...valid, feeAmount: '50.000', paymentInstructions: 'BCA  12345' },
      { ...valid, feeAmount: '50.000', paymentInstructions: 'QRIS <di lokasi>' },
      { ...valid, feeAmount: '50.000', paymentInstructions: 'BCA\u200b 1234567' },
    ];
    // Peramban mengompilasi `pattern` dengan flag v dan mencocokkan seluruh nilai.
    const capacityPattern = new RegExp(`^(?:${CAPACITY_PATTERN})$`, 'v');
    for (const values of cases) {
      const clientOk =
        capacityPattern.test(values.capacity) &&
        Object.values(registrationSettingsIssues(values)).every((message) => message === '');
      expect(clientOk, JSON.stringify(values)).toBe(serverAccepts(values));
    }
  });
});
