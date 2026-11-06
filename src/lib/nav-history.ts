/**
 * "Kembali" yang tidak kehilangan tempat (ADR-067).
 *
 * Tombol kembali di halaman dalam adalah tautan HIERARKIS (`/tracker/x` →
 * `/tracker`): bekerja tanpa JavaScript, dari tautan yang dibagikan, dan
 * tidak pernah melempar orang keluar situs. Kelemahannya: daftar asal yang
 * sedang disaring (`/tracker?tahap=APPLIED`, `/events?type=LOMBA&page=3`)
 * hilang, begitu juga posisi gulirnya.
 *
 * Karena itu, bila halaman SEBELUMNYA di tab ini adalah tujuan tautan itu
 * (path sama, query boleh beda), tombolnya memakai riwayat peramban: daftar
 * kembali lengkap dengan saringan & posisi gulir. Selain itu tautan biasa.
 * Satu langkah saja yang dicatat — cukup untuk "dari mana aku datang", dan
 * tidak ada yang perlu disimpan di luar memori tab.
 */

function pathOf(url: string): string {
  const pathname = new URL(url, 'http://localhost').pathname;
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** Apakah kunjungan sebelumnya adalah tujuan `href` (abaikan query & hash). */
export function returnsTo(previous: string | null, href: string): boolean {
  return previous !== null && pathOf(previous) === pathOf(href);
}

export interface VisitLog {
  record(url: string): void;
  previous(): string | null;
}

/** Dua kunjungan terakhir. Mencatat URL yang sama dua kali (render ulang) tidak menggeser apa pun. */
export function createVisitLog(): VisitLog {
  let current: string | null = null;
  let before: string | null = null;
  return {
    record(url) {
      if (url === current) return;
      before = current;
      current = url;
    },
    previous: () => before,
  };
}

/** Satu log per tab; hanya diisi dari klien (`NavigationProgress`), server tidak pernah mencatat. */
export const visitLog = createVisitLog();
