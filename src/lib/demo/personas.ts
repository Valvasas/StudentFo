import type { EducationLevel } from '@/types/domain';

/**
 * Persona akun demo (mode seed).
 *
 * Tiga persona dipilih untuk mendemonstrasikan tiga cabang perilaku yang
 * berbeda, bukan tiga "contoh pengguna" acak:
 *  - `mahasiswa`  → profil lengkap: urutan kegiatan memakai skor personal.
 *  - `siswa-baru` → profil kosong: jalur cold start (recency + popularitas).
 *  - `admin`      → dasbor moderasi, dijaga gerbang yang sama dengan produksi.
 *  - `penyelenggara` → penyelenggara TERVERIFIKASI dengan tiga acara contoh
 *    dan riwayat analitik fiktif (ADR-042/043). Perannya tetap USER: status
 *    penyelenggara bukan peran sistem, dan tidak memberi akses moderasi.
 *
 * Minat memakai slug kategori dari `SEED_CATEGORIES` — slug yang tidak ada
 * di data contoh tidak akan pernah cocok di `categoryMatch()`.
 */
export const DEMO_PERSONA_IDS = ['mahasiswa', 'siswa-baru', 'admin', 'penyelenggara'] as const;
export type DemoPersonaId = (typeof DEMO_PERSONA_IDS)[number];

export interface DemoPersona {
  readonly id: DemoPersonaId;
  readonly label: string;
  readonly summary: string;
  readonly fullName: string;
  readonly role: 'USER' | 'ADMIN';
  readonly educationLevel: EducationLevel | null;
  readonly major: string | null;
  readonly interests: readonly string[];
}

export const DEMO_PERSONAS: Readonly<Record<DemoPersonaId, DemoPersona>> = {
  mahasiswa: {
    id: 'mahasiswa',
    label: 'Mahasiswa',
    summary: 'Profil lengkap (D4/S1, teknologi & desain) — rekomendasi personal & jaringan contoh aktif.',
    fullName: 'Dinda Pratiwi',
    role: 'USER',
    educationLevel: 'D4_S1',
    major: 'Rekayasa Perangkat Lunak',
    interests: ['teknologi', 'desain', 'bisnis'],
  },
  'siswa-baru': {
    id: 'siswa-baru',
    label: 'Siswa baru',
    summary: 'Profil belum diisi — lihat urutan cold start, lalu lengkapi profilnya.',
    fullName: 'Raka Aditya',
    role: 'USER',
    educationLevel: null,
    major: null,
    interests: [],
  },
  admin: {
    id: 'admin',
    label: 'Admin moderator',
    summary: 'Buka dasbor /admin untuk menyetujui atau menolak kegiatan dan kiriman.',
    fullName: 'Admin Moderator',
    role: 'ADMIN',
    educationLevel: 'UMUM',
    major: null,
    interests: [],
  },
  penyelenggara: {
    id: 'penyelenggara',
    label: 'Penyelenggara',
    summary: 'Penyelenggara terverifikasi — dasbor analitik acara, klaim, dan permintaan perubahan.',
    fullName: 'Sekar Ayu (Himpunan Informatika)',
    role: 'USER',
    educationLevel: 'D4_S1',
    major: 'Teknik Informatika',
    interests: ['teknologi'],
  },
};

export function isDemoPersonaId(value: unknown): value is DemoPersonaId {
  return typeof value === 'string' && (DEMO_PERSONA_IDS as readonly string[]).includes(value);
}
