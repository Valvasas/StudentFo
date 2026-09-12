import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Permukaan dasar. Elevasi dibangun dari border + shadow halus di light
 * mode, dan dari perbedaan surface di dark mode (shadow praktis tak terlihat
 * di atas latar gelap — memaksakannya hanya menghasilkan kotak buram).
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-panel shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
