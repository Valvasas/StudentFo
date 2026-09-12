import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge/chip.
 *
 * Semua varian memakai pasangan container + foreground (pola Material 3),
 * bukan warna solid dengan teks putih. Alasannya kontras: badge berukuran
 * kecil dan sering bertumpuk; warna solid jenuh dalam jumlah banyak membuat
 * kartu jadi "lampu disko" dan justru menghapus hierarki.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      variant: {
        neutral: 'bg-panel-nested text-ink-soft',
        brand: 'bg-brand-soft text-brand-text',
        outline: 'border border-line text-ink-muted',
        success: 'bg-success-soft text-success',
        warning: 'bg-caution-soft text-caution',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
