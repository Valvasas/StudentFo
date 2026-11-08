import { describe, expect, it } from 'vitest';
import { changePasswordSchema, newPasswordSchema, signUpSchema } from './auth-schema';
import { newPasswordFailure, signUpValidationFailure } from './auth-failure';
import { organizerSignUpSchema } from './organizer';

const participant = {
  accountType: 'participant',
  fullName: 'Siti Aminah',
  email: 'siti@kampus.ac.id',
  password: 'rahasia123',
  confirmPassword: 'rahasia123',
  ageConfirm: 'yes',
  privacyConsent: 'yes',
};

const organizer = {
  ...participant,
  authority: 'yes',
  orgName: 'Himpunan Mahasiswa',
  orgType: 'ORMAWA',
  contactRole: 'Ketua',
  website: '',
  evidence: 'Saya ketua, lihat https://himpunan.example/pengurus',
};

function failureOf(schema: typeof signUpSchema | typeof organizerSignUpSchema, input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('seharusnya gagal');
  return signUpValidationFailure(result.error, String(input.password ?? ''));
}

describe('signUpValidationFailure', () => {
  it('sandi beda → password_mismatch, bukan "ada isian yang belum benar"', () => {
    expect(failureOf(signUpSchema, { ...participant, confirmPassword: 'rahasia124' })).toBe('password_mismatch');
    expect(failureOf(signUpSchema, { ...participant, confirmPassword: '' })).toBe('password_mismatch');
  });

  it('sandi lemah menang atas ketidakcocokan yang muncul bersamaan', () => {
    expect(failureOf(signUpSchema, { ...participant, password: 'pendek', confirmPassword: 'beda' })).toBe('weak_password');
  });

  it('sandi > 72 byte UTF-8 diberi kode sendiri', () => {
    const long = `Kata1${'é'.repeat(40)}`;
    expect(failureOf(signUpSchema, { ...participant, password: long, confirmPassword: long })).toBe('password_too_long');
  });

  it('pernyataan usia & persetujuan didahulukan dari kolom lain', () => {
    expect(failureOf(signUpSchema, { ...participant, ageConfirm: '', confirmPassword: 'beda' })).toBe('age_required');
    expect(failureOf(signUpSchema, { ...participant, privacyConsent: '' })).toBe('consent_required');
  });

  it('penyelenggara: wewenang lalu data lembaga, sebelum urusan sandi', () => {
    expect(failureOf(organizerSignUpSchema, { ...organizer, authority: '' })).toBe('authority_required');
    expect(failureOf(organizerSignUpSchema, { ...organizer, orgType: '', confirmPassword: 'beda' })).toBe('organizer_details');
    expect(failureOf(organizerSignUpSchema, { ...organizer, website: 'http://bukan-https.example' })).toBe('organizer_details');
    expect(failureOf(organizerSignUpSchema, { ...organizer, confirmPassword: 'beda' })).toBe('password_mismatch');
  });

  it('email rusak → kode umum', () => {
    expect(failureOf(signUpSchema, { ...participant, email: 'bukan-email' })).toBe('validation');
  });
});

describe('newPasswordFailure (setel ulang & ganti sandi)', () => {
  it('setel ulang: tidak sama → password_mismatch', () => {
    const result = newPasswordSchema.safeParse({ password: 'rahasia123', confirmPassword: 'rahasia321' });
    expect(result.success).toBe(false);
    expect(result.error && newPasswordFailure(result.error, 'rahasia123')).toBe('password_mismatch');
  });

  it('ganti sandi: sama dengan yang sekarang → same_password, bukan "sandi lemah"', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'rahasia123', password: 'rahasia123', confirmPassword: 'rahasia123' });
    expect(result.error && newPasswordFailure(result.error, 'rahasia123')).toBe('same_password');
  });

  it('ganti sandi: sandi lama kosong bukan urusan kolom sandi baru', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: '', password: 'rahasia123', confirmPassword: 'rahasia123' });
    expect(result.error && newPasswordFailure(result.error, 'rahasia123')).toBeNull();
  });
});
