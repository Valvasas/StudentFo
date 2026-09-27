import type { TrackerStatus } from '@/types/domain';

/** Urutan tahap maju di papan pendaftaran. REJECTED bukan tahap, melainkan akhir cabang. */
export const TRACKER_STEPS = ['SAVED', 'APPLIED', 'INTERVIEW', 'ACCEPTED'] as const satisfies readonly TrackerStatus[];

export const TRACKER_STEP_LABEL: Record<(typeof TRACKER_STEPS)[number], string> = {
  SAVED: 'Disimpan',
  APPLIED: 'Sudah daftar',
  INTERVIEW: 'Seleksi / wawancara',
  ACCEPTED: 'Diterima',
};

export interface TrackerProgress {
  /** Indeks tahap terakhir yang tercapai (0..3). */
  readonly reached: number;
  readonly rejected: boolean;
  /** Langkah berikutnya yang bisa dilakukan pengguna, atau null bila selesai. */
  readonly next: string | null;
}

/**
 * Posisi sebuah lamaran di urutan tahap. Status "ditolak" tidak menyimpan
 * di tahap mana penolakan terjadi, jadi bilahnya berhenti di "Sudah daftar"
 * — satu-satunya tahap yang pasti sudah dilalui — dan ditandai ditolak.
 */
export function trackerProgress(status: TrackerStatus): TrackerProgress {
  switch (status) {
    case 'SAVED':
      return { reached: 0, rejected: false, next: 'Daftar di situs penyelenggara, lalu tandai "Sudah daftar"' };
    case 'APPLIED':
      return { reached: 1, rejected: false, next: 'Tunggu kabar seleksi dari penyelenggara' };
    case 'INTERVIEW':
      return { reached: 2, rejected: false, next: 'Siapkan diri untuk tahap seleksi' };
    case 'ACCEPTED':
      return { reached: 3, rejected: false, next: null };
    case 'REJECTED':
      return { reached: 1, rejected: true, next: null };
  }
}
