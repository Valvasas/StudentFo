import { answerInputName } from '@/lib/registration-form';
import type { EducationLevel, FormField } from '@/types/domain';

/**
 * "Isi dari profil" (ADR-094): jawaban yang SUDAH ada di akun pendaftar —
 * tempat studi, jenjang, domisili, nama, email — ditawarkan untuk pertanyaan
 * panitia yang jelas menanyakannya. Hanya mengusulkan: pendaftar menekan
 * tombolnya sendiri, kolom yang sudah diisi tidak ditimpa, dan semuanya
 * bisa diubah sebelum dikirim. Pencocokan sengaja konservatif (jenis +
 * kata kunci judul); salah isi lebih mahal daripada tidak mengisi.
 */
export interface ProfileFacts {
  readonly fullName: string | null;
  readonly email: string | null;
  readonly institutionName: string | null;
  readonly educationLevel: EducationLevel | null;
  /** Label wilayah tampilan (`regionLabel`), mis. "Kota Bandung, Jawa Barat". */
  readonly domicile: string | null;
}

export interface ProfileFillItem {
  /** Nama input jawaban (`answerInputName`). */
  readonly name: string;
  readonly label: string;
  readonly value: string;
  /** Asal nilai, untuk keterangan "dari profil: tempat studi". */
  readonly source: 'nama' | 'email' | 'tempat studi' | 'jenjang' | 'domisili';
}

const norm = (value: string) => value.toLocaleLowerCase('id-ID');

/** Judul yang menanyakan orang LAIN (anggota, pembimbing, ketua tim) tidak diisi data pendaftar. */
const ABOUT_SOMEONE_ELSE = /anggota|pembimbing|guru|dosen|tiap|masing|orang tua|wali|rekan|partner|tim\b|kelompok/;

const INSTITUTION = /(asal|nama)\s+(sekolah|kampus|instansi|universitas|perguruan tinggi)|^(sekolah|kampus|instansi|universitas|perguruan tinggi)\b|sekolah\s*\/\s*kampus/;
const DOMICILE = /domisili|kota asal|asal kota|kabupaten\s*\/\s*kota|kota\s*\/\s*kabupaten/;
const FULL_NAME = /^nama( lengkap)?( peserta| pendaftar)?$/;
const LEVEL = /jenjang/;

/** Kata yang dicari di pilihan untuk tiap jenjang — pilihan panitia ditulis bebas ("D4/S1", "S1 / D4", "Mahasiswa S1"). */
const LEVEL_KEYWORDS: Record<EducationLevel, readonly RegExp[]> = {
  SMA_SMK: [/\bsma\b/, /\bsmk\b/, /\bma\b/],
  D3: [/\bd3\b/, /\bd-3\b/],
  D4_S1: [/\bs1\b/, /\bd4\b/, /\bs-1\b/],
  S2: [/\bs2\b/, /\bs-2\b/],
  S3: [/\bs3\b/, /\bs-3\b/],
  UMUM: [/\bumum\b/],
};

function levelOption(field: FormField, level: EducationLevel): string | null {
  const patterns = LEVEL_KEYWORDS[level];
  const matches = field.options.filter((option) => patterns.some((pattern) => pattern.test(norm(option))));
  // Dua pilihan sama-sama cocok ("SMA" & "SMA/SMK") = ambigu: biarkan pendaftar memilih.
  return matches.length === 1 ? matches[0]! : null;
}

export function profileFillFor(fields: readonly FormField[], facts: ProfileFacts): ProfileFillItem[] {
  const items: ProfileFillItem[] = [];
  const used = new Set<ProfileFillItem['source']>();
  const push = (field: FormField, value: string | null, source: ProfileFillItem['source']) => {
    if (!value || used.has(source)) return;
    used.add(source);
    items.push({ name: answerInputName(field), label: field.label, value, source });
  };

  for (const field of fields) {
    const label = norm(field.label.trim());
    if (ABOUT_SOMEONE_ELSE.test(label)) continue;
    if (field.type === 'short_text') {
      if (INSTITUTION.test(label)) push(field, facts.institutionName, 'tempat studi');
      else if (DOMICILE.test(label)) push(field, facts.domicile, 'domisili');
      else if (FULL_NAME.test(label)) push(field, facts.fullName, 'nama');
    } else if (field.type === 'email') {
      push(field, facts.email, 'email');
    } else if ((field.type === 'dropdown' || field.type === 'select') && LEVEL.test(label) && facts.educationLevel) {
      push(field, levelOption(field, facts.educationLevel), 'jenjang');
    }
  }
  return items;
}
