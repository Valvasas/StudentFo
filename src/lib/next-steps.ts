/**
 * Langkah awal anggota (ajakan bertindak, ADR-086).
 *
 * DIHITUNG dari keadaan akun di setiap render, tidak disimpan sebagai
 * notifikasi: langkah yang sudah dikerjakan hilang dengan sendirinya, tidak
 * ada antrean pengingat yang basi, dan tidak ada tabel/penjadwal baru. Satu
 * fakta yang gagal dimuat (`null`) = langkah itu tidak ditampilkan, bukan
 * ditebak belum dikerjakan.
 */

/** Cookie preferensi "sembunyikan langkah awal" — pola yang sama dengan `sf_sidebar`. */
export const NEXT_STEPS_COOKIE = 'sf_langkah';
export const NEXT_STEPS_MAX_AGE = 60 * 60 * 24 * 365;

export function isNextStepsHidden(value: string | undefined): boolean {
  return value === 'hidden';
}

export type NextStepKey = 'minat' | 'simpan' | 'daftar' | 'foto' | 'teman' | 'tim';

export interface NextStep {
  readonly key: NextStepKey;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly done: boolean;
}

export interface NextStepFacts {
  /** Jenjang + minat terisi (`isProfileComplete`). */
  readonly profileReady: boolean;
  /** null = kolom foto belum ada di database ini (ADR-083) → langkahnya tidak ditawarkan. */
  readonly hasPhoto: boolean | null;
  readonly savedCount: number | null;
  /** Kegiatan yang sudah didaftar: baris papan berstatus Sudah Daftar ke atas, atau pendaftaran formulir StudentFo. */
  readonly registeredCount: number | null;
  readonly connectionCount: number | null;
  readonly teamCount: number | null;
}

/** Urutan = urutan dampaknya bagi pendatang baru: rekomendasi dulu, lalu kebiasaan inti, lalu komunitas. */
export function nextSteps(facts: NextStepFacts): readonly NextStep[] {
  const steps: (NextStep | null)[] = [
    {
      key: 'minat',
      title: 'Pilih minat & jenjang',
      body: 'Rekomendasi dan pengingat menyesuaikan pilihanmu.',
      href: '/profile/interests',
      done: facts.profileReady,
    },
    facts.savedCount === null
      ? null
      : {
          key: 'simpan',
          title: 'Simpan kegiatan pertama',
          body: 'Tenggatnya kami ingatkan tiga hari dan sehari sebelum tutup.',
          href: '/events',
          done: facts.savedCount > 0,
        },
    facts.registeredCount === null
      ? null
      : {
          key: 'daftar',
          title: 'Daftar kegiatan pertamamu',
          body: 'Lomba, beasiswa, atau magang — lalu tandai “Sudah daftar” di papan lamaran.',
          // Sudah menyimpan sesuatu → papan lamaran tempat menandainya; belum → cari dulu.
          href: (facts.savedCount ?? 0) > 0 ? '/tracker' : '/events?type=LOMBA',
          done: facts.registeredCount > 0,
        },
    facts.hasPhoto === null
      ? null
      : {
          key: 'foto',
          title: 'Pasang foto profil',
          body: 'Wajahmu tampil di Koneksi, tim, dan lobi — lebih mudah dikenali calon rekan.',
          href: '/profile/details#tampilan',
          done: facts.hasPhoto,
        },
    facts.connectionCount === null
      ? null
      : {
          key: 'teman',
          title: 'Terhubung dengan satu orang',
          body: 'Rekan satu minat saling melihat kegiatan yang diikuti.',
          href: '/connections',
          done: facts.connectionCount > 0,
        },
    facts.teamCount === null
      ? null
      : {
          key: 'tim',
          title: 'Gabung atau buka tim',
          body: 'Banyak lomba wajib berkelompok. Cari rekan lintas kampus.',
          href: '/teams',
          done: facts.teamCount > 0,
        },
  ];
  return steps.filter((step): step is NextStep => step !== null);
}

export interface NextStepsSummary {
  readonly steps: readonly NextStep[];
  readonly done: number;
  /** Langkah pertama yang belum selesai; null = semua selesai. */
  readonly next: NextStep | null;
}

export function summarizeSteps(steps: readonly NextStep[]): NextStepsSummary {
  return { steps, done: steps.filter((step) => step.done).length, next: steps.find((step) => !step.done) ?? null };
}

/**
 * Satu saran untuk lonceng navbar. Hanya langkah yang faktanya sudah ada di
 * sesi (`AuthUser`) — lonceng tampil di SETIAP halaman, dan query tambahan
 * di sana dibayar di setiap kunjungan.
 */
export function profileNudge(facts: Pick<NextStepFacts, 'profileReady' | 'hasPhoto'>): NextStep | null {
  return summarizeSteps(
    nextSteps({ ...facts, savedCount: null, registeredCount: null, connectionCount: null, teamCount: null }),
  ).next;
}
