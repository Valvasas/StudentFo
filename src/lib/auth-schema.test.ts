import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  emailSchema,
  fullNameSchema,
  newPasswordSchema,
  passwordSchema,
  profileSchema,
  signUpSchema,
} from './auth-schema';

describe('emailSchema', () => {
  it('menormalkan huruf besar dan spasi di ujung', () => {
    expect(emailSchema.parse('  Budi@Kampus.AC.ID ')).toBe('budi@kampus.ac.id');
  });

  it('menolak bentuk yang bukan email', () => {
    expect(emailSchema.safeParse('budi-at-kampus').success).toBe(false);
  });

  it('menolak alamat di atas batas RFC 5321', () => {
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.id`).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('menerima kata sandi yang memenuhi syarat', () => {
    expect(passwordSchema.safeParse('rahasia123').success).toBe(true);
  });

  it('menolak yang kurang dari 8 karakter', () => {
    expect(passwordSchema.safeParse('abc1234').success).toBe(false);
  });

  it('menolak yang tidak memuat angka atau tidak memuat huruf', () => {
    expect(passwordSchema.safeParse('katasandiku').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });

  it('menolak di atas 72 karakter — bcrypt memotong diam-diam di titik itu', () => {
    expect(passwordSchema.safeParse(`${'a'.repeat(72)}1`).success).toBe(false);
  });
});

describe('fullNameSchema', () => {
  it('merapikan spasi ganda', () => {
    expect(fullNameSchema.parse('  Budi   Santoso  ')).toBe('Budi Santoso');
  });

  it('menolak nama terlalu pendek', () => {
    expect(fullNameSchema.safeParse('B').success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('mengembalikan nilai yang sudah dinormalkan, bukan masukan mentah', () => {
    const result = signUpSchema.parse({
      fullName: ' Siti  Aminah ',
      email: ' SITI@kampus.ac.id ',
      password: 'rahasia123',
    });
    expect(result.fullName).toBe('Siti Aminah');
    expect(result.email).toBe('siti@kampus.ac.id');
  });
});

describe('newPasswordSchema', () => {
  it('menolak konfirmasi yang tidak sama', () => {
    const result = newPasswordSchema.safeParse({
      password: 'rahasia123',
      confirmPassword: 'rahasia124',
    });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('menolak kata sandi baru yang sama dengan yang sekarang', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'rahasia123',
      password: 'rahasia123',
      confirmPassword: 'rahasia123',
    });
    expect(result.success).toBe(false);
  });

  it('menerima penggantian yang sah', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'rahasia123',
      password: 'rahasia456',
      confirmPassword: 'rahasia456',
    });
    expect(result.success).toBe(true);
  });
});

describe('profileSchema', () => {
  it('menerima profil kosong — jenjang dan jurusan memang opsional', () => {
    const result = profileSchema.safeParse({
      fullName: 'Budi Santoso',
      educationLevel: null,
      major: null,
      interests: [],
    });
    expect(result.success).toBe(true);
  });

  it('menolak slug minat yang bentuknya tidak sah', () => {
    const result = profileSchema.safeParse({
      fullName: 'Budi Santoso',
      educationLevel: 'D4_S1',
      major: null,
      interests: ['teknologi', '<script>'],
    });
    expect(result.success).toBe(false);
  });

  it('menolak jenjang di luar enum', () => {
    const result = profileSchema.safeParse({
      fullName: 'Budi Santoso',
      educationLevel: 'S9',
      major: null,
      interests: [],
    });
    expect(result.success).toBe(false);
  });
});
