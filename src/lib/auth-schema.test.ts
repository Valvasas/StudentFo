import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  emailSchema,
  fullNameSchema,
  newPasswordSchema,
  parseAccountType,
  passwordSchema,
  postSignUpPath,
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

  it('menolak kalimat bebas — /verify-email hanya mencetak ?email= yang lolos skema ini', () => {
    expect(emailSchema.safeParse('Akun kamu DITANGGUHKAN — hubungi wa.me/6281234 a@b.id').success).toBe(false);
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

  it('batas 72 dihitung dalam byte UTF-8: 57 karakter beraksen (97 byte) ditolak dengan pesan yang jelas', () => {
    const result = passwordSchema.safeParse(`Kata1${'é'.repeat(40)}${'x'.repeat(12)}`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/terlalu panjang.*beraksen atau emoji/);
    expect(passwordSchema.safeParse(`a1${'é'.repeat(35)}`).success).toBe(true);
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
      accountType: 'participant',
      fullName: ' Siti  Aminah ',
      email: ' SITI@kampus.ac.id ',
      password: 'rahasia123',
      privacyConsent: 'yes',
    });
    expect(result.fullName).toBe('Siti Aminah');
    expect(result.email).toBe('siti@kampus.ac.id');
  });

  const valid = { accountType: 'organizer', fullName: 'Siti', email: 'siti@kampus.ac.id', password: 'rahasia123', privacyConsent: 'yes' };

  it('persetujuan Kebijakan privasi wajib — kotak tak dicentang tidak terkirim sama sekali', () => {
    const result = signUpSchema.safeParse({ ...valid, privacyConsent: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['privacyConsent']);
  });

  it('jenis akun hanya dari daftar tertutup', () => {
    expect(signUpSchema.safeParse({ ...valid, accountType: 'admin' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, accountType: '' }).success).toBe(false);
  });
});

describe('parseAccountType & postSignUpPath', () => {
  it('nilai URL/form asing diabaikan', () => {
    expect(parseAccountType('organizer')).toBe('organizer');
    expect(parseAccountType(['participant', 'organizer'])).toBe('participant');
    expect(parseAccountType('ADMIN')).toBeNull();
    expect(parseAccountType(undefined)).toBeNull();
  });

  it('penyelenggara selalu ke studio; peserta ke tujuan yang sudah aman', () => {
    expect(postSignUpPath('organizer', '/events/x/formulir')).toBe('/penyelenggara');
    expect(postSignUpPath('participant', '/events/x/formulir')).toBe('/events/x/formulir');
    expect(postSignUpPath('participant', '/')).toBe('/');
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
