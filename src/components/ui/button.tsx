import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tombol dasar.
 *
 * `min-h-11` (44px) bukan angka estetika: itu ukuran target sentuh minimum
 * menurut WCAG 2.5.5 / Apple HIG. Di bawah itu, tingkat salah-tekan di
 * layar ponsel naik tajam — dan mayoritas pengguna produk ini membuka dari
 * ponsel.
 *
 * Kelima state (default/hover/active/focus-visible/disabled) didefinisikan
 * di sini sekali untuk semua, supaya tidak ada tombol yang "lupa" punya
 * indikator fokus.
 *
 * Rasa ditekan (ADR-055): bibir tuts inset + `active:pt-0.5` — isi turun 1px
 * di dalam kotak yang tingginya TETAP (setiap ukuran memakai `h-*`, tanpa
 * `py-*`, jadi padding atas tidak menimpa apa pun). Kotak sentuhnya tidak
 * pernah mengecil; lihat globals.css §9 kenapa bukan `scale`.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-card font-semibold tracking-[-0.005em]',
    'transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-snap active:pt-0.5 active:duration-[40ms]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:opacity-60',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-pressed disabled:bg-panel-nested disabled:text-ink-faint',
        secondary:
          'press bg-panel text-ink border border-line hover:border-line-strong hover:bg-panel-nested active:bg-panel-nested disabled:text-ink-faint',
        ghost:
          'text-ink-soft hover:bg-panel-nested hover:text-ink active:bg-line/60 disabled:text-ink-faint',
        danger:
          'press bg-danger-soft text-danger border border-danger-line hover:bg-danger hover:text-white active:opacity-90',
        success:
          'press bg-success-soft text-success border border-success-line hover:bg-success hover:text-white active:opacity-90',
      },
      size: {
        // Tampil 36px (baris aksi yang padat), tapi area sentuh tetap 44px:
        // ::after memperluas 4px ke atas & bawah dan ikut menerima klik.
        sm: "relative h-9 min-h-9 px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        md: 'h-11 min-h-11 px-4 text-sm',
        lg: 'h-12 min-h-12 px-6 text-base',
        icon: 'size-11 min-h-11 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render sebagai anak (mis. <Link>) tanpa membungkus <button> di dalam <a>. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
