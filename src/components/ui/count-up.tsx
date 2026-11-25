import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Angka yang menghitung naik SEKALI saat masuk layar (ADR-099). CSS murni
 * (globals.css §14) + `RevealObserver` yang menandai `data-revealed` — tanpa
 * pewaktu JS. Teks aslinya selalu ada di DOM, jadi tanpa JS, di
 * reduced-motion, dan bagi pembaca layar yang tampil/dibacakan adalah angka
 * sebenarnya.
 *
 * `counter()` tidak menulis pemisah ribuan, jadi angka ≥ 1.000 tidak
 * dianimasikan: yang terlihat harus sama dengan yang dibacakan ("1.204",
 * bukan "1204").
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const text = value.toLocaleString('id-ID');
  if (!Number.isInteger(value) || value < 0 || value >= 1000) {
    return <span className={cn('tabular-nums', className)}>{text}</span>;
  }
  return (
    <span data-count-up="" className={cn('count-up', className)} style={{ '--to': value, '--digits': text.length } as CSSProperties}>
      <span className="count-up-value">{text}</span>
    </span>
  );
}
