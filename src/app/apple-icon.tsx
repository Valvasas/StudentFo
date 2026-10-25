import { brandIcon } from '@/components/og/brand-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Ikon layar utama iOS — kotak penuh tanpa sudut membulat; iOS memberi masker sendiri. */
export default function AppleIcon() {
  return brandIcon(size.width, { tile: true });
}
