import { brandIcon } from '@/components/og/brand-icon';

/**
 * Tiga ukuran dari satu berkas (tanpa biner di repo): 32 = tab browser (juga
 * dilayani di `/favicon.ico`, lihat next.config.ts), 192/512 = manifest untuk
 * "Tambahkan ke layar utama" di Android.
 */
export function generateImageMetadata() {
  return [32, 192, 512].map((side) => ({
    id: String(side),
    size: { width: side, height: side },
    contentType: 'image/png',
  }));
}

export default function Icon({ id }: { id: string }) {
  const side = Number(id);
  return brandIcon(side, { tile: side > 32 });
}
