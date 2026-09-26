/** Di bawah ini, banner demo berganti dari informasi menjadi peringatan. */
export const DEMO_RESET_WARNING_MINUTES = 30;

export interface DemoResetInfo {
  readonly nextResetAt: Date;
  /** Dibulatkan ke atas: "1 menit lagi" lebih jujur daripada "0 menit" selama masih ada sisa. */
  readonly minutesLeft: number;
  readonly imminent: boolean;
}

/**
 * Kapan data demo dibangun ulang. Reset terjadi pada request pertama SETELAH
 * TTL habis (lihat `memoryRepository()`), jadi `nextResetAt` adalah waktu
 * paling awal — tidak pernah lebih cepat.
 */
export function demoResetInfo(createdAt: Date, now: Date, ttlMs: number): DemoResetInfo {
  const nextResetAt = new Date(createdAt.getTime() + ttlMs);
  const minutesLeft = Math.max(0, Math.ceil((nextResetAt.getTime() - now.getTime()) / 60_000));
  return { nextResetAt, minutesLeft, imminent: minutesLeft <= DEMO_RESET_WARNING_MINUTES };
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'kurang dari 1 menit';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} menit`;
}
