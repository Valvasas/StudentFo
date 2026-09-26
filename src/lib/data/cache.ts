import { unstable_cache } from 'next/cache';

/** Tag semua data publik turunan tabel events; dicabut saat moderasi mengubah katalog. */
export const EVENTS_CACHE_TAG = 'events';

/**
 * Umur maksimum cache data publik. Batas atas "basi" untuk perubahan yang
 * TIDAK memanggil revalidateTag: job expiry pg_cron, saved_count, dan
 * tenggat yang lewat di tengah jendela. Label H-n tidak ikut basi — dihitung
 * ulang dari tanggal tenggat di setiap render.
 */
export const PUBLIC_DATA_REVALIDATE_SECONDS = 300;

export type CacheLayer = <Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
) => (...args: Args) => Promise<Result>;

/**
 * Data Cache Next.js. Kenapa cache di lapisan DATA, bukan halaman: CSP
 * bernonce (ADR-027) mewajibkan HTML dirender per request, jadi ISR tidak
 * mungkin. Yang mahal adalah query-nya, dan itu yang dibagi antarpengunjung.
 */
export const nextDataCache: CacheLayer = (fn, keyParts) =>
  unstable_cache(fn, keyParts, { tags: [EVENTS_CACHE_TAG], revalidate: PUBLIC_DATA_REVALIDATE_SECONDS });

/** Tanpa cache — untuk test yang harus melihat setiap perubahan database seketika. */
export const noCache: CacheLayer = (fn) => fn;
